import type { JobUpdateCheckResult } from '@job-search-facilitator/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applicationArtifactRepository } from '../../src/db/repositories/application-artifact.repository.ts'
import { jobPostRepository } from '../../src/db/repositories/job-post.repository.ts'
import { jobUpdateCheckRepository } from '../../src/db/repositories/job-update-check.repository.ts'
import { outreachContactRepository } from '../../src/db/repositories/outreach.repository.ts'
import { prisma } from '../../src/db/prisma.ts'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required for repository integration tests')
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1))

if (!databaseName.endsWith('_test')) {
    throw new Error('Integration test database name must end in "_test"')
}

const createJobPost = () =>
    prisma.jobPost.create({
        data: {
            sourceKey: 'track-feature:post',
            roleTitle: 'Software Engineer',
            company: 'Example Company',
            location: 'Remote',
            compensation: null,
            techStack: 'TypeScript',
            postSource: 'Company site',
            postUrl: 'https://example.com/jobs/track-feature',
            applicationUrl: 'https://apply.example.com/jobs/track-feature',
            postStatus: 'ACTIVE',
        },
    })

beforeEach(async () => {
    await prisma.jobPost.deleteMany()
})

afterAll(async () => {
    await prisma.$disconnect()
})

describe('application artifact and job update repositories', () => {
    it('replaces the uploaded artifact for the same job and kind', async () => {
        const post = await createJobPost()
        const first = {
            content: Buffer.from('%PDF-first'),
            fileName: 'first-resume.pdf',
            mediaType: 'application/pdf',
        }
        const replacement = {
            content: Buffer.from('%PDF-replacement'),
            fileName: 'replacement-resume.pdf',
            mediaType: 'application/pdf',
        }

        await applicationArtifactRepository.save(post.id, 'resume', first)
        await applicationArtifactRepository.save(post.id, 'resume', replacement)
        await jobPostRepository.update(post.id, { applicationStatus: 'awaiting-response' })
        const tracked = (await jobPostRepository.findTracked())[0]!
        const downloaded = await applicationArtifactRepository.findFile(post.id, 'resume')

        expect({
            artifacts: tracked.applicationArtifacts,
            content: downloaded?.content.toString(),
        }).toEqual({
            artifacts: [downloaded?.artifact],
            content: replacement.content.toString(),
        })
    })

    it('removes only the selected artifact from an Apply queue post', async () => {
        const post = await createJobPost()
        await jobPostRepository.update(post.id, { userLabel: 'P1' })
        await applicationArtifactRepository.save(post.id, 'resume', {
            content: Buffer.from('%PDF-resume'),
            fileName: 'resume.pdf',
            mediaType: 'application/pdf',
        })
        const coverLetter = await applicationArtifactRepository.save(post.id, 'cover-letter', {
            content: Buffer.from('%PDF-cover-letter'),
            fileName: 'cover-letter.pdf',
            mediaType: 'application/pdf',
        })

        const removed = await applicationArtifactRepository.remove(post.id, 'resume')
        const resume = await applicationArtifactRepository.findFile(post.id, 'resume')
        const applyQueue = await jobPostRepository.findApplyQueue()

        expect({ removed, resume, artifacts: applyQueue[0]?.applicationArtifacts }).toEqual({
            removed: true,
            resume: null,
            artifacts: [coverLetter],
        })
    })

    it('removes manual activity when application and outreach updates are reversed', async () => {
        const post = await createJobPost()
        const contact = await outreachContactRepository.create(post.id, {
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            email: null,
            relevanceRationale: 'Her role aligns with the position.',
            draftMessage: 'Hi Ada, could I ask about the team?',
        })

        if (contact === null) {
            throw new Error('Could not create outreach contact')
        }

        await jobPostRepository.update(post.id, { applicationStatus: 'awaiting-response' })
        await jobPostRepository.update(post.id, { applicationStatus: 'interviewing' })
        const interviewingActivity = await prisma.jobPostActivity.findFirst({
            where: {
                jobPostId: post.id,
                source: 'MANUAL',
                type: 'APPLICATION_STATUS_CHANGED',
            },
            select: { id: true },
        })

        if (interviewingActivity === null) {
            throw new Error('Interviewing activity was not created')
        }

        await jobPostRepository.update(post.id, { applicationStatus: 'rejected' })
        await jobPostRepository.update(post.id, { applicationStatus: 'interviewing' })
        let applicationStatusActivity = await prisma.jobPostActivity.findMany({
            where: {
                jobPostId: post.id,
                source: 'MANUAL',
                type: 'APPLICATION_STATUS_CHANGED',
            },
            select: { id: true },
        })

        expect(applicationStatusActivity).toEqual([interviewingActivity])

        await jobPostRepository.update(post.id, { applicationStatus: 'rejected' })
        const rejectedActivity = await prisma.jobPostActivity.findFirst({
            where: {
                jobPostId: post.id,
                source: 'MANUAL',
                type: 'APPLICATION_STATUS_CHANGED',
                id: { not: interviewingActivity.id },
            },
            select: { id: true },
        })

        if (rejectedActivity === null) {
            throw new Error('Rejected activity was not created')
        }

        await jobPostRepository.update(post.id, { applicationStatus: 'hired' })
        applicationStatusActivity = await prisma.jobPostActivity.findMany({
            where: {
                jobPostId: post.id,
                source: 'MANUAL',
                type: 'APPLICATION_STATUS_CHANGED',
            },
            select: { id: true },
        })

        expect({
            count: applicationStatusActivity.length,
            retainedInterviewing: applicationStatusActivity.some(
                ({ id }) => id === interviewingActivity.id,
            ),
            retainedRejected: applicationStatusActivity.some(
                ({ id }) => id === rejectedActivity.id,
            ),
        }).toEqual({ count: 2, retainedInterviewing: true, retainedRejected: false })

        await jobPostRepository.update(post.id, { applicationStatus: 'awaiting-response' })
        await outreachContactRepository.update(post.id, contact.id, { messaged: true })
        await outreachContactRepository.update(post.id, contact.id, { responded: true })
        await prisma.jobPostActivity.create({
            data: {
                jobPostId: post.id,
                type: 'APPLICATION_ACKNOWLEDGED',
                source: 'GMAIL',
                externalId: 'gmail:acknowledged',
                summary: 'Application acknowledged',
                occurredAt: new Date(),
            },
        })

        await outreachContactRepository.update(post.id, contact.id, { responded: false })
        const afterResponseReversal = await prisma.jobPostActivity.findMany({
            where: { jobPostId: post.id, source: 'MANUAL' },
            select: { type: true },
        })

        expect(afterResponseReversal.map(({ type }) => type).sort()).toEqual([
            'APPLICATION_SUBMITTED',
            'OUTREACH_SENT',
        ])

        await outreachContactRepository.update(post.id, contact.id, { messaged: false })
        await jobPostRepository.update(post.id, { applicationStatus: 'not-applied' })
        const remainingActivities = await prisma.jobPostActivity.findMany({
            where: { jobPostId: post.id },
            select: { source: true, type: true },
        })

        expect(remainingActivities).toEqual([{ source: 'GMAIL', type: 'APPLICATION_ACKNOWLEDGED' }])
    })

    it('applies each observed update once without regressing status', async () => {
        const post = await createJobPost()
        await jobPostRepository.update(post.id, { applicationStatus: 'awaiting-response' })
        const contact = await outreachContactRepository.create(post.id, {
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            email: null,
            relevanceRationale: 'Her role aligns with the position.',
            draftMessage: 'Hi Ada, could I ask about the team?',
        })

        if (contact === null) {
            throw new Error('Could not create outreach contact')
        }

        await outreachContactRepository.update(post.id, contact.id, { messaged: true })
        const observedAt = new Date(Date.now() + 1_000)
        const initialResult = {
            warnings: [],
            updates: [
                {
                    kind: 'application-status',
                    jobPostId: post.id,
                    status: 'interviewing',
                    source: 'gmail',
                    externalId: 'gmail:interview',
                    summary: 'Interview requested',
                    sourceUrl: null,
                    occurredAt: observedAt.toISOString(),
                },
                {
                    kind: 'outreach-response',
                    jobPostId: post.id,
                    outreachContactId: contact.id,
                    source: 'linkedin',
                    externalId: 'linkedin:response',
                    summary: 'Contact responded',
                    sourceUrl: contact.profileUrl,
                    occurredAt: observedAt.toISOString(),
                },
            ],
        } satisfies JobUpdateCheckResult

        const first = await jobUpdateCheckRepository.save(initialResult)
        const repeated = await jobUpdateCheckRepository.save(initialResult)
        const laterResult = {
            warnings: [],
            updates: [
                {
                    kind: 'application-status',
                    jobPostId: post.id,
                    status: 'awaiting-response',
                    source: 'gmail',
                    externalId: 'gmail:late-acknowledgement',
                    summary: 'Late acknowledgement',
                    sourceUrl: null,
                    occurredAt: new Date(observedAt.getTime() + 1_000).toISOString(),
                },
                {
                    kind: 'review-needed',
                    jobPostId: post.id,
                    outreachContactId: null,
                    source: 'gmail',
                    externalId: 'gmail:ambiguous',
                    summary: 'Possible application update',
                    sourceUrl: null,
                    occurredAt: new Date(observedAt.getTime() + 2_000).toISOString(),
                },
            ],
        } satisfies JobUpdateCheckResult
        await jobUpdateCheckRepository.save(laterResult)
        const tracked = (await jobPostRepository.findTracked())[0]!

        expect(first).toEqual({ createdActivities: 2 })
        expect(repeated).toEqual({ createdActivities: 0 })
        expect({
            applicationStatus: tracked.post.applicationStatus,
            responded: tracked.contacts[0]?.respondedAt !== null,
        }).toEqual({
            applicationStatus: 'interviewing',
            responded: true,
        })
    })
})
