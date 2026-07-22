import type {
    JobPostInput,
    JobSearchResultInput,
    UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { jobPostRepository } from '../../src/db/repositories/job-post.repository.ts'
import { outreachContactRepository } from '../../src/db/repositories/outreach-contact.repository.ts'
import { outreachRunRepository } from '../../src/db/repositories/outreach-run.repository.ts'
import { searchReportRepository } from '../../src/db/repositories/search-report.repository.ts'
import { prisma } from '../../src/db/prisma.ts'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required for repository integration tests')
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1))

if (!databaseName.endsWith('_test')) {
    throw new Error('Integration test database name must end in "_test"')
}

const createPostInput = (overrides: Partial<JobPostInput> = {}): JobPostInput => ({
    sourceKey: 'example-source:123',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Detroit, MI',
    compensation: '$120,000',
    postSource: 'Example Source',
    postUrl: 'https://example.com/jobs/123',
    applicationUrl: 'https://apply.example.com/jobs/123',
    postStatus: 'active',
    ...overrides,
})

type ResultOverrides = Partial<Omit<JobSearchResultInput, 'post'>> & {
    post?: Partial<JobPostInput>
}

const createResultInput = (overrides: ResultOverrides = {}): JobSearchResultInput => {
    const {
        agentRank = 1,
        agentLabel = 'target',
        fitRationale = 'Strong TypeScript experience',
        applicationFlow = 'Direct company application',
        keyLegitimacySignals = 'Listed on the company careers page',
        recommendedResume = 'frontend',
        recommendedAction = 'Apply today',
        legitimacyNotes = null,
        post,
    } = overrides

    return {
        agentRank,
        agentLabel,
        fitRationale,
        applicationFlow,
        keyLegitimacySignals,
        recommendedResume,
        recommendedAction,
        legitimacyNotes,
        post: createPostInput(post),
    }
}

const createReportInput = (
    overrides: Partial<UpsertJobSearchReportInput> = {},
): UpsertJobSearchReportInput => {
    const { summary = 'One strong match', results = [createResultInput()] } = overrides

    return { summary, results }
}

beforeEach(async () => {
    await prisma.outreachContact.deleteMany()
    await prisma.outreachRun.deleteMany()
    await prisma.jobSearchResult.deleteMany()
    await prisma.jobSearchReport.deleteMany()
    await prisma.jobPost.deleteMany()
})

afterAll(async () => {
    await prisma.$disconnect()
})

describe('job post repository', () => {
    it('lists only actionable labeled posts', async () => {
        const userLabels = ['P1', 'P2', 'quick-app', 'forgo', null] as const
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: userLabels.map((_, index) =>
                    createResultInput({
                        agentRank: index + 1,
                        post: { sourceKey: `example-source:${index}` },
                    }),
                ),
            }),
        )

        await Promise.all(
            userLabels.map((userLabel, index) =>
                jobPostRepository.update(report.report.results[index]!.post.id, { userLabel }),
            ),
        )
        await jobPostRepository.update(report.report.results[0]!.post.id, {
            applicationStatus: 'awaiting-response',
        })

        const labeledPosts = await jobPostRepository.findLabeled()
        const labels = labeledPosts.map(({ userLabel }) => userLabel)

        expect(labels).toHaveLength(2)
        expect(labels).toEqual(expect.arrayContaining(['P2', 'quick-app']))
    })
})

describe('outreach run repository', () => {
    it('persists the Work task lifecycle for a job post', async () => {
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-18',
            createReportInput(),
        )
        const jobPostId = report.report.results[0]!.post.id
        const created = await outreachRunRepository.create({
            jobPostId,
            requestedContactCount: 3,
        })

        expect(created).not.toBeNull()

        const running = await outreachRunRepository.update(created!.id, {
            status: 'running',
            workTaskId: '22222222-2222-4222-8222-222222222222',
            workThreadId: 'thread-id',
            workTurnId: 'turn-id',
        })
        const completed = await outreachRunRepository.update(created!.id, {
            status: 'completed',
        })

        expect(running).toMatchObject({
            status: 'running',
            workTaskId: '22222222-2222-4222-8222-222222222222',
            workThreadId: 'thread-id',
            workTurnId: 'turn-id',
        })
        expect(completed).toMatchObject({
            status: 'completed',
            error: null,
        })
        expect(completed?.completedAt).not.toBeNull()
    })
})

describe('outreach contact repository', () => {
    it('stores, updates, and lists job-post contacts', async () => {
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-21',
            createReportInput(),
        )
        const jobPostId = report.report.results[0]!.post.id
        const first = await outreachContactRepository.create(jobPostId, {
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            relevanceRationale: 'Her visible role aligns with the position.',
            draftMessage: 'Hi Ada, I would value your perspective on the role.',
        })
        const second = await outreachContactRepository.create(jobPostId, {
            personName: 'Grace Hopper',
            personTitle: 'Director of Engineering',
            profileUrl: 'https://www.linkedin.com/in/grace-hopper',
            relevanceRationale: 'Her visible role aligns with the team.',
            draftMessage: 'Hi Grace, I would value your perspective on the team.',
        })

        if (first === null) {
            throw new Error('Could not create the first outreach contact')
        }

        const wrongPostUpdate = await outreachContactRepository.update(
            '22222222-2222-4222-8222-222222222222',
            first.id,
            { messaged: true },
        )
        const updatedFirst = await outreachContactRepository.update(jobPostId, first.id, {
            messaged: true,
        })

        const contacts = await outreachContactRepository.findByJobPostId(jobPostId)

        expect(wrongPostUpdate).toBeNull()
        expect(updatedFirst).toMatchObject({ id: first.id, jobPostId, messaged: true })
        expect(second).toMatchObject({ jobPostId, messaged: false })
        expect(contacts.map(({ personName }) => personName)).toEqual([
            'Grace Hopper',
            'Ada Lovelace',
        ])
        expect(contacts.find(({ id }) => id === first.id)?.messaged).toBe(true)
    })
})

describe('search report repository', () => {
    it('replaces one report run without duplicating the report', async () => {
        const reportDate = '2026-07-12'
        const reportId = '11111111-1111-4111-8111-111111111111'
        const initialInput = createReportInput({
            summary: 'Two initial matches',
            results: [
                createResultInput({
                    agentRank: 1,
                    post: { sourceKey: 'example-source:first' },
                }),
                createResultInput({
                    agentRank: 2,
                    post: { sourceKey: 'example-source:second' },
                }),
            ],
        })
        const replacementInput = createReportInput({
            summary: 'One replacement match',
            results: [
                createResultInput({
                    post: {
                        sourceKey: 'example-source:second',
                        roleTitle: 'Senior Software Engineer',
                    },
                }),
            ],
        })

        const initial = await searchReportRepository.upsertById(reportId, reportDate, initialInput)
        const replacement = await searchReportRepository.upsertById(
            reportId,
            reportDate,
            replacementInput,
        )
        const [reportCount, resultCount] = await Promise.all([
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count(),
        ])

        expect(initial.created).toBe(true)
        expect(replacement.created).toBe(false)
        expect(replacement.report.id).toBe(initial.report.id)
        expect(replacement.report.summary).toBe(replacementInput.summary)
        expect(replacement.report.results).toHaveLength(1)
        expect(replacement.report.results[0]).toMatchObject({
            applicationFlow: replacementInput.results[0]?.applicationFlow,
            keyLegitimacySignals: replacementInput.results[0]?.keyLegitimacySignals,
        })
        expect(replacement.report.results[0]?.post.sourceKey).toBe('example-source:second')
        expect(reportCount).toBe(1)
        expect(resultCount).toBe(1)
    })

    it('creates separate reports for runs on the same date', async () => {
        const reportDate = '2026-07-12'
        const first = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            reportDate,
            createReportInput({ summary: 'First run' }),
        )
        const second = await searchReportRepository.upsertById(
            '22222222-2222-4222-8222-222222222222',
            reportDate,
            createReportInput({ summary: 'Second run' }),
        )
        const reports = await searchReportRepository.findMany()

        expect(first.created).toBe(true)
        expect(second.created).toBe(true)
        expect(reports).toHaveLength(2)
        expect(reports.map(({ id }) => id)).toEqual(
            expect.arrayContaining([first.report.id, second.report.id]),
        )
    })

    it('shares canonical posts while preserving user state during listing refreshes', async () => {
        const sourceKey = 'example-source:shared'
        const archivedAt = '2026-07-12T12:00:00.000Z'
        const first = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: [createResultInput({ post: { sourceKey } })],
            }),
        )
        const postId = first.report.results[0]?.post.id

        expect(postId).toBeDefined()
        await jobPostRepository.update(postId!, {
            applicationStatus: 'interviewing',
            userRank: 1,
            userLabel: 'forgo',
            archivedAt,
        })

        const second = await searchReportRepository.upsertById(
            '22222222-2222-4222-8222-222222222222',
            '2026-07-13',
            createReportInput({
                results: [
                    createResultInput({
                        post: {
                            sourceKey,
                            roleTitle: 'Senior Software Engineer',
                            company: 'Updated Company',
                            location: 'Remote',
                            compensation: '$150,000',
                            postSource: 'Updated Source',
                            postUrl: 'https://example.com/jobs/updated',
                            applicationUrl: 'https://apply.example.com/jobs/updated',
                            postStatus: 'closed',
                        },
                    }),
                ],
            }),
        )
        const refreshedPost = second.report.results[0]?.post
        const [postCount, reportCount, membershipCount] = await Promise.all([
            prisma.jobPost.count(),
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count({ where: { postId } }),
        ])

        expect(second.created).toBe(true)
        expect(refreshedPost).toMatchObject({
            id: postId,
            sourceKey,
            roleTitle: 'Senior Software Engineer',
            company: 'Updated Company',
            location: 'Remote',
            compensation: '$150,000',
            postSource: 'Updated Source',
            postUrl: 'https://example.com/jobs/updated',
            applicationUrl: 'https://apply.example.com/jobs/updated',
            postStatus: 'closed',
            applicationStatus: 'interviewing',
            userRank: 1,
            userLabel: 'forgo',
            archivedAt,
        })
        expect(postCount).toBe(1)
        expect(reportCount).toBe(2)
        expect(membershipCount).toBe(2)
    })

    it('rolls back a failed replacement after deleting prior joins', async () => {
        const reportDate = '2026-07-12'
        const reportId = '11111111-1111-4111-8111-111111111111'
        const initial = await searchReportRepository.upsertById(
            reportId,
            reportDate,
            createReportInput({
                summary: 'Stable snapshot',
                results: [
                    createResultInput({
                        post: {
                            sourceKey: 'example-source:stable',
                            roleTitle: 'Stable Role',
                        },
                    }),
                ],
            }),
        )
        const invalidReplacement = createReportInput({
            summary: 'Must roll back',
            results: [
                createResultInput({
                    agentRank: 1,
                    post: {
                        sourceKey: 'example-source:stable',
                        roleTitle: 'Mutated Role',
                    },
                }),
                createResultInput({
                    agentRank: 1,
                    post: { sourceKey: 'example-source:new' },
                }),
            ],
        })

        await expect(
            searchReportRepository.upsertById(reportId, reportDate, invalidReplacement),
        ).rejects.toThrow()

        const savedReport = await searchReportRepository.findById(reportId)
        const [reportCount, resultCount, postCount] = await Promise.all([
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count(),
            prisma.jobPost.count(),
        ])

        expect(savedReport).toEqual(initial.report)
        expect(reportCount).toBe(1)
        expect(resultCount).toBe(1)
        expect(postCount).toBe(1)
    })
})
