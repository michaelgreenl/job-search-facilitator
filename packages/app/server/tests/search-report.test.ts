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
    postSource: 'Example Source',
    applicationUrl: 'https://example.com/jobs/123',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
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
            roleTitle: result.post.roleTitle,
            company: result.post.company,
            location: result.post.location,
            compensation: result.post.compensation,
            postSource: result.post.postSource,
            applicationUrl: result.post.applicationUrl,
            postStatus: result.post.postStatus,
        },
    })),
}

const toReport = (
    date: string,
    reportInput: UpsertJobSearchReportInput,
    previous?: JobSearchReport,
): JobSearchReport => ({
    id: previous?.id ?? existingReport.id,
    reportDate: date,
    summary: reportInput.summary,
    createdAt: previous?.createdAt ?? existingReport.createdAt,
    updatedAt: existingReport.updatedAt,
    archivedAt: previous?.archivedAt ?? null,
    results: reportInput.results.map((result) => ({
        agentRank: result.agentRank,
        agentLabel: result.agentLabel,
        fitRationale: result.fitRationale,
        applicationFlow: result.applicationFlow,
        keyLegitimacySignals: result.keyLegitimacySignals,
        recommendedResume: result.recommendedResume,
        recommendedAction: result.recommendedAction,
        legitimacyNotes: result.legitimacyNotes,
        post: {
            ...post,
            ...result.post,
        },
    })),
})

const createFakeRepository = (initialReports: JobSearchReport[]) => {
    const reports = new Map(initialReports.map((report) => [report.reportDate, report]))
    const upsertByDate = vi.fn(
        async (
            date: string,
            reportInput: UpsertJobSearchReportInput,
        ): Promise<SearchReportUpsertResult> => {
            const previous = reports.get(date)
            const report = toReport(date, reportInput, previous)
            reports.set(date, report)

            return { report, created: previous === undefined }
        },
    )
    const repository: SearchReportRepository = {
        findMany: async () => [...reports.values()],
        findByDate: async (date) => reports.get(date) ?? null,
        upsertByDate,
    }

    return { repository, upsertByDate }
}

const createTestApp = (repository: SearchReportRepository) => {
    const app = express()
    app.use(express.json())
    app.use('/job-search-reports', createSearchReportRouter(repository))
    return app
}

describe('job search report routes', () => {
    it('lists job search reports', async () => {
        const { repository } = createFakeRepository([existingReport])

        await request(createTestApp(repository))
            .get('/job-search-reports')
            .expect(200, [existingReport])
    })

    it('forwards a valid dated snapshot and returns 201 when it is created', async () => {
        const { repository, upsertByDate } = createFakeRepository([])

        const response = await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}`)
            .send(input)
            .expect(201)

        expect(upsertByDate).toHaveBeenCalledExactlyOnceWith(reportDate, input)
        expect(response.body).toEqual(existingReport)
    })

    it('accepts an empty replacement snapshot and returns 200 for an existing report', async () => {
        const { repository, upsertByDate } = createFakeRepository([existingReport])
        const replacement: UpsertJobSearchReportInput = {
            summary: 'No matching roles today',
            results: [],
        }

        const response = await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}`)
            .send(replacement)
            .expect(200)

        expect(upsertByDate).toHaveBeenCalledExactlyOnceWith(reportDate, replacement)
        expect(response.body).toEqual({
            ...existingReport,
            summary: replacement.summary,
            results: [],
        })
    })

    it('rejects whitespace-only required and optional text without writing', async () => {
        const { repository, upsertByDate } = createFakeRepository([])
        const result = input.results[0]

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}`)
            .send({ ...input, summary: '   ' })
            .expect(400, { error: 'Invalid request' })

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}`)
            .send({
                ...input,
                results: [
                    {
                        ...result,
                        applicationFlow: ' ',
                        keyLegitimacySignals: ' ',
                        legitimacyNotes: ' ',
                        post: {
                            ...result.post,
                            location: '',
                            compensation: '   ',
                        },
                    },
                ],
            })
            .expect(400, { error: 'Invalid request' })

        expect(upsertByDate).not.toHaveBeenCalled()
    })

    it.each([
        ['an invalid date', '2026-02-30', input],
        [
            'a user-owned post field',
            reportDate,
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
    ])('rejects %s without writing', async (_description, date, invalidInput) => {
        const { repository, upsertByDate } = createFakeRepository([])

        await request(createTestApp(repository))
            .put(`/job-search-reports/${date}`)
            .send(invalidInput)
            .expect(400, { error: 'Invalid request' })

        expect(upsertByDate).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing valid report date', async () => {
        const { repository } = createFakeRepository([])

        await request(createTestApp(repository))
            .get(`/job-search-reports/${reportDate}`)
            .expect(404, { error: 'Job search report not found' })
    })
})
