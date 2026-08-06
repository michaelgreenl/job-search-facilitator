import type {
    JobPost,
    JobSearchReport,
    UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createSearchReportRouter } from '../src/api/routes/search-report.route.ts'
import type {
    SearchReportRepository,
    SearchReportUpsertResult,
} from '../src/db/repositories/search-report.repository.ts'

const reportDate = '2026-07-12'

const post: JobPost = {
    id: '11111111-1111-4111-8111-111111111111',
    sourceKey: 'example-source:123',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Detroit, MI',
    compensation: '$120,000',
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Example Source',
    postUrl: 'https://example.com/jobs/123',
    applicationUrl: 'https://apply.example.com/jobs/123',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    appliedAt: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
}

const existingReport: JobSearchReport = {
    id: '22222222-2222-4222-8222-222222222222',
    reportDate,
    summary: 'One strong match',
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    archivedAt: null,
    results: [
        {
            agentRank: 1,
            agentLabel: 'target',
            fitRationale: 'Strong TypeScript experience',
            applicationFlow: 'Direct company application',
            keyLegitimacySignals: 'Listed on the company careers page',
            recommendedResume: 'frontend',
            recommendedAction: 'Apply today',
            legitimacyNotes: null,
            post,
        },
    ],
}

const input: UpsertJobSearchReportInput = {
    summary: existingReport.summary,
    results: existingReport.results.map((result) => ({
        agentRank: result.agentRank,
        agentLabel: result.agentLabel,
        fitRationale: result.fitRationale,
        applicationFlow: result.applicationFlow,
        keyLegitimacySignals: result.keyLegitimacySignals,
        recommendedResume: result.recommendedResume,
        recommendedAction: result.recommendedAction,
        legitimacyNotes: result.legitimacyNotes,
        post: {
            sourceKey: result.post.sourceKey,
            description: 'Complete job description',
            roleTitle: result.post.roleTitle,
            company: result.post.company,
            location: result.post.location,
            compensation: result.post.compensation,
            techStack: result.post.techStack,
            postSource: result.post.postSource,
            postUrl: result.post.postUrl,
            applicationUrl: result.post.applicationUrl,
            postStatus: result.post.postStatus,
        },
    })),
}

const createFakeRepository = () => {
    const findMany = vi.fn(async () => [existingReport])
    const findById = vi.fn(
        async (_reportId: string): Promise<JobSearchReport | null> => existingReport,
    )
    const upsertById = vi.fn(
        async (
            _reportId: string,
            _date: string,
            _reportInput: UpsertJobSearchReportInput,
        ): Promise<SearchReportUpsertResult> => ({ report: existingReport, created: true }),
    )
    const repository: SearchReportRepository = {
        findMany,
        findById,
        upsertById,
    }

    return { findById, findMany, repository, upsertById }
}

const createTestApp = (repository: SearchReportRepository) => {
    const app = express()
    app.use(express.json())
    app.use('/job-search-reports', createSearchReportRouter(repository))
    return app
}

describe('job search report routes', () => {
    it('lists job search reports', async () => {
        const { findMany, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get('/job-search-reports')
            .expect(200, [existingReport])

        expect(findMany).toHaveBeenCalledOnce()
    })

    it('gets a job search report by id', async () => {
        const { findById, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get(`/job-search-reports/${existingReport.id}`)
            .expect(200, existingReport)

        expect(findById).toHaveBeenCalledExactlyOnceWith(existingReport.id)
    })

    it('forwards a valid dated snapshot and returns 201 when it is created', async () => {
        const { repository, upsertById } = createFakeRepository()

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
            .send(input)
            .expect(201, existingReport)

        expect(upsertById).toHaveBeenCalledExactlyOnceWith(existingReport.id, reportDate, input)
    })

    it('accepts an empty replacement snapshot and returns 200 for an existing report', async () => {
        const { repository, upsertById } = createFakeRepository()
        const replacement: UpsertJobSearchReportInput = {
            summary: 'No matching roles today',
            results: [],
        }
        upsertById.mockResolvedValueOnce({
            report: { ...existingReport, summary: replacement.summary, results: [] },
            created: false,
        })

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
            .send(replacement)
            .expect(200, { ...existingReport, summary: replacement.summary, results: [] })

        expect(upsertById).toHaveBeenCalledExactlyOnceWith(
            existingReport.id,
            reportDate,
            replacement,
        )
    })

    it.each([
        ['summary', (value: UpsertJobSearchReportInput) => (value.summary = ' ')],
        [
            'application flow',
            (value: UpsertJobSearchReportInput) => (value.results[0]!.applicationFlow = ' '),
        ],
        [
            'legitimacy signals',
            (value: UpsertJobSearchReportInput) => (value.results[0]!.keyLegitimacySignals = ' '),
        ],
        [
            'legitimacy notes',
            (value: UpsertJobSearchReportInput) => (value.results[0]!.legitimacyNotes = ' '),
        ],
        [
            'location',
            (value: UpsertJobSearchReportInput) => (value.results[0]!.post.location = ' '),
        ],
        [
            'compensation',
            (value: UpsertJobSearchReportInput) => (value.results[0]!.post.compensation = ' '),
        ],
        [
            'technology stack',
            (value: UpsertJobSearchReportInput) => (value.results[0]!.post.techStack = ' '),
        ],
    ] satisfies Array<[field: string, invalidate: (value: UpsertJobSearchReportInput) => void]>)(
        'rejects whitespace-only %s without writing',
        async (_field, invalidate) => {
            const { repository, upsertById } = createFakeRepository()
            const invalidInput = structuredClone(input)
            invalidate(invalidInput)

            await request(createTestApp(repository))
                .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
                .send(invalidInput)
                .expect(400)

            expect(upsertById).not.toHaveBeenCalled()
        },
    )

    it.each([
        ['post URL', { ...input.results[0]!.post, postUrl: 'javascript:alert(1)' }],
        ['application URL', { ...input.results[0]!.post, applicationUrl: 'ftp://example.com/job' }],
    ])('rejects an unsafe %s without writing', async (_description, invalidPost) => {
        const { repository, upsertById } = createFakeRepository()

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
            .send({
                ...input,
                results: [{ ...input.results[0], post: invalidPost }],
            })
            .expect(400)

        expect(upsertById).not.toHaveBeenCalled()
    })

    it.each([
        ['an invalid date', '2026-02-30', existingReport.id, input],
        ['an invalid report id', reportDate, 'invalid-id', input],
        [
            'a user-owned post field',
            reportDate,
            existingReport.id,
            {
                ...input,
                results: [
                    {
                        ...input.results[0],
                        post: {
                            ...input.results[0].post,
                            applicationStatus: 'interviewing',
                        },
                    },
                ],
            },
        ],
        [
            'duplicate agent ranks',
            reportDate,
            existingReport.id,
            {
                ...input,
                results: [
                    input.results[0],
                    {
                        ...input.results[0],
                        post: {
                            ...input.results[0].post,
                            sourceKey: 'example-source:456',
                        },
                    },
                ],
            },
        ],
        [
            'duplicate post source keys',
            reportDate,
            existingReport.id,
            {
                ...input,
                results: [
                    input.results[0],
                    {
                        ...input.results[0],
                        agentRank: 2,
                    },
                ],
            },
        ],
    ])('rejects %s without writing', async (_description, date, reportId, invalidInput) => {
        const { repository, upsertById } = createFakeRepository()

        await request(createTestApp(repository))
            .put(`/job-search-reports/${date}/${reportId}`)
            .send(invalidInput)
            .expect(400)

        expect(upsertById).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing valid report id', async () => {
        const { findById, repository } = createFakeRepository()
        const missingReportId = '33333333-3333-4333-8333-333333333333'
        findById.mockResolvedValueOnce(null)

        await request(createTestApp(repository))
            .get(`/job-search-reports/${missingReportId}`)
            .expect(404)

        expect(findById).toHaveBeenCalledExactlyOnceWith(missingReportId)
    })
})
