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
    id: string,
    date: string,
    reportInput: UpsertJobSearchReportInput,
    previous?: JobSearchReport,
): JobSearchReport => ({
    id,
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
    const reports = new Map(initialReports.map((report) => [report.id, report]))
    const upsertById = vi.fn(
        async (
            reportId: string,
            date: string,
            reportInput: UpsertJobSearchReportInput,
        ): Promise<SearchReportUpsertResult> => {
            const previous = reports.get(reportId)
            const report = toReport(reportId, date, reportInput, previous)
            reports.set(reportId, report)

            return { report, created: previous === undefined }
        },
    )
    const repository: SearchReportRepository = {
        findMany: async () => [...reports.values()],
        findById: async (id) => reports.get(id) ?? null,
        upsertById,
    }

    return { repository, upsertById }
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

    it('gets a job search report by id', async () => {
        const { repository } = createFakeRepository([existingReport])

        await request(createTestApp(repository))
            .get(`/job-search-reports/${existingReport.id}`)
            .expect(200, existingReport)
    })

    it('forwards a valid dated snapshot and returns 201 when it is created', async () => {
        const { repository, upsertById } = createFakeRepository([])

        const response = await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
            .send(input)
            .expect(201)

        expect(upsertById).toHaveBeenCalledExactlyOnceWith(existingReport.id, reportDate, input)
        expect(response.body).toEqual(existingReport)
    })

    it('accepts an empty replacement snapshot and returns 200 for an existing report', async () => {
        const { repository, upsertById } = createFakeRepository([existingReport])
        const replacement: UpsertJobSearchReportInput = {
            summary: 'No matching roles today',
            results: [],
        }

        const response = await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
            .send(replacement)
            .expect(200)

        expect(upsertById).toHaveBeenCalledExactlyOnceWith(
            existingReport.id,
            reportDate,
            replacement,
        )
        expect(response.body).toEqual({
            ...existingReport,
            summary: replacement.summary,
            results: [],
        })
    })

    it('rejects whitespace-only required and optional text without writing', async () => {
        const { repository, upsertById } = createFakeRepository([])
        const result = input.results[0]

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
            .send({ ...input, summary: '   ' })
            .expect(400, { error: 'Invalid request' })

        await request(createTestApp(repository))
            .put(`/job-search-reports/${reportDate}/${existingReport.id}`)
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
        const { repository, upsertById } = createFakeRepository([])

        await request(createTestApp(repository))
            .put(`/job-search-reports/${date}/${reportId}`)
            .send(invalidInput)
            .expect(400, { error: 'Invalid request' })

        expect(upsertById).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing valid report id', async () => {
        const { repository } = createFakeRepository([])

        await request(createTestApp(repository))
            .get('/job-search-reports/33333333-3333-4333-8333-333333333333')
            .expect(404, { error: 'Job search report not found' })
    })
})
