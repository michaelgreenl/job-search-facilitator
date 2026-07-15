import type { JobPost, JobSearchReport } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePostStore } from '../stores/post.store'
import { useReportStore } from '../stores/report.store'

const post: JobPost = {
    id: 'post-1',
    sourceKey: 'example:post-1',
    roleTitle: 'Software Engineer',
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    applicationUrl: 'https://example.com/jobs/post-1',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
}

const report: JobSearchReport = {
    id: 'report-1',
    reportDate: '2026-07-13',
    summary: 'One matching role',
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
    archivedAt: null,
    results: [
        {
            agentRank: 1,
            agentLabel: 'target',
            fitRationale: 'Strong TypeScript fit',
            applicationFlow: 'Direct application',
            keyLegitimacySignals: 'Listed on company careers page',
            recommendedResume: 'backend-full-stack',
            recommendedAction: 'Apply',
            legitimacyNotes: null,
            post,
        },
    ],
}

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

describe('report store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('loads report lists and refreshes a report by date', async () => {
        const refreshedReport = { ...report, summary: 'Updated summary' }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse([report]))
            .mockResolvedValueOnce(jsonResponse(refreshedReport))
        const store = useReportStore()

        await store.fetchReports()
        await store.fetchReport(report.reportDate)

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/job-search-reports',
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3000/api/job-search-reports/${report.reportDate}`,
            undefined,
        )
        expect(store.reports).toEqual([refreshedReport])
    })

    it('exposes failed requests to the UI', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useReportStore()

        await expect(store.fetchReports()).rejects.toThrow('API request failed (500)')

        expect(store.error).toBe('API request failed (500)')
        expect(store.loading).toBe(false)
    })
})

describe('post store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('loads posts and keeps PATCH responses as the current post state', async () => {
        const secondPost = { ...post, id: 'post-2', sourceKey: 'example:post-2' }
        const updatedPost = {
            ...post,
            applicationStatus: 'awaiting-response' as const,
            userLabel: 'forgo' as const,
        }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse([post]))
            .mockResolvedValueOnce(jsonResponse(secondPost))
            .mockResolvedValueOnce(jsonResponse(updatedPost))
        const store = usePostStore()
        const reportStore = useReportStore()
        reportStore.reports = [report]

        await store.fetchPosts()
        await store.fetchPost(secondPost.id)
        await store.updatePost(post.id, {
            applicationStatus: 'awaiting-response',
            userLabel: 'forgo',
        })

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/job-posts',
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3000/api/job-posts/${secondPost.id}`,
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3000/api/job-posts/${post.id}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicationStatus: 'awaiting-response',
                    userLabel: 'forgo',
                }),
            },
        )
        expect(store.posts).toEqual([updatedPost, secondPost])
        expect(reportStore.reports[0]?.results[0]?.post).toEqual(updatedPost)
    })
})
