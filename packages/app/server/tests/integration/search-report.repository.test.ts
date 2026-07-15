import type {
    JobPostInput,
    JobSearchResultInput,
    UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { jobPostRepository } from '../../src/db/repositories/job-post.repository.ts'
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
    applicationUrl: 'https://example.com/jobs/123',
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
    await prisma.jobSearchResult.deleteMany()
    await prisma.jobSearchReport.deleteMany()
    await prisma.jobPost.deleteMany()
})

afterAll(async () => {
    await prisma.$disconnect()
})

describe('search report repository', () => {
    it('replaces one dated report without duplicating the report', async () => {
        const reportDate = '2026-07-12'
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

        const initial = await searchReportRepository.upsertByDate(reportDate, initialInput)
        const replacement = await searchReportRepository.upsertByDate(reportDate, replacementInput)
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

    it('shares canonical posts while preserving user state during listing refreshes', async () => {
        const sourceKey = 'example-source:shared'
        const archivedAt = '2026-07-12T12:00:00.000Z'
        const first = await searchReportRepository.upsertByDate(
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

        const second = await searchReportRepository.upsertByDate(
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
                            applicationUrl: 'https://example.com/jobs/updated',
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
            applicationUrl: 'https://example.com/jobs/updated',
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
        const initial = await searchReportRepository.upsertByDate(
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
            searchReportRepository.upsertByDate(reportDate, invalidReplacement),
        ).rejects.toThrow()

        const savedReport = await searchReportRepository.findByDate(reportDate)
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
