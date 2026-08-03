import type { JobUpdateCheckResult } from '@job-search-facilitator/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applicationCaptureRepository } from '../../src/db/repositories/application-capture.repository.ts'
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

describe('application capture and job update repositories', () => {
    it('replaces both saved snapshots on recapture', async () => {
        const post = await createJobPost()
        const first = {
            jobPost: {
                description: 'First complete job description',
                sourceUrl: post.postUrl,
            },
            application: {
                content: 'First complete filled application',
                sourceUrl: post.applicationUrl,
            },
        }
        const replacement = {
            jobPost: {
                description: 'Replacement complete job description',
                sourceUrl: post.postUrl,
            },
            application: {
                content: 'Replacement complete filled application',
                sourceUrl: post.applicationUrl,
            },
        }

        await applicationCaptureRepository.save(post.id, first)
        await applicationCaptureRepository.save(post.id, replacement)
        await jobPostRepository.update(post.id, { applicationStatus: 'awaiting-response' })
        const tracked = (await jobPostRepository.findTracked())[0]!

        expect({
            description: tracked.jobPostSnapshot?.description,
            applicationContent: tracked.applicationSnapshot?.content,
        }).toEqual({
            description: replacement.jobPost.description,
            applicationContent: replacement.application.content,
        })
    })

    it('applies each observed update once without regressing status or overwriting a manual next step', async () => {
        const post = await createJobPost()
        await jobPostRepository.update(post.id, { applicationStatus: 'awaiting-response' })
        const contact = await outreachContactRepository.create(post.id, {
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
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
        await jobPostRepository.saveNextStep(post.id, {
            title: 'User-owned next step',
            dueAt: new Date(observedAt.getTime() + 86_400_000).toISOString(),
            completedAt: null,
        })
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
            nextStepTitle: tracked.nextStep?.title,
        }).toEqual({
            applicationStatus: 'interviewing',
            responded: true,
            nextStepTitle: 'User-owned next step',
        })
    })
})
