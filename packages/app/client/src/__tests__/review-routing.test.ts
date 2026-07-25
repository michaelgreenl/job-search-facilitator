/** @vitest-environment jsdom */

import type { JobPost, JobSearchReport } from '@job-search-facilitator/core'
import { createPinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createMemoryHistory, createRouter, type HistoryState, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewView from '../views/ReviewView.vue'

const createPost = (id: string, roleTitle: string): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: `https://example.com/jobs/${id}`,
    applicationUrl: `https://apply.example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
})

const createReport = (
    id: string,
    reportDate: string,
    summary: string,
    post: JobPost,
): JobSearchReport => ({
    id,
    reportDate,
    summary,
    createdAt: `${reportDate}T12:00:00.000Z`,
    updatedAt: `${reportDate}T12:00:00.000Z`,
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
})

const firstPost = createPost('10000000-0000-4000-8000-000000000001', 'Frontend Engineer')
const secondPost = createPost('10000000-0000-4000-8000-000000000002', 'Backend Engineer')
const thirdPost = createPost('10000000-0000-4000-8000-000000000003', 'Platform Engineer')
const labeledPost = {
    ...createPost('10000000-0000-4000-8000-000000000004', 'Labeled Engineer'),
    userLabel: 'P1' as const,
}
const forgonePost = {
    ...createPost('10000000-0000-4000-8000-000000000005', 'Forgone Engineer'),
    userLabel: 'forgo' as const,
}
const firstReport = createReport(
    '20000000-0000-4000-8000-000000000001',
    '2026-07-10',
    'First report',
    firstPost,
)
const secondReportBase = createReport(
    '20000000-0000-4000-8000-000000000002',
    '2026-07-15',
    'Second report',
    secondPost,
)
const secondReport: JobSearchReport = {
    ...secondReportBase,
    results: [
        ...secondReportBase.results,
        { ...secondReportBase.results[0]!, post: labeledPost },
        { ...secondReportBase.results[0]!, post: forgonePost },
    ],
}
const thirdReport = createReport(
    '20000000-0000-4000-8000-000000000003',
    '2026-07-15',
    'Third report',
    thirdPost,
)
const reports = [firstReport, secondReport, thirdReport]

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

interface MountedReview {
    app: App
    root: HTMLElement
    router: Router
}

const mountedReviews: MountedReview[] = []

const findTestButton = (root: HTMLElement, testId: string) => {
    const button = root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)

    if (button === null) {
        throw new Error(`Could not find button "${testId}"`)
    }

    return button
}

const reportButton = (root: HTMLElement, reportId: string) =>
    findTestButton(root, `report-card-${reportId}`)

const postButton = (root: HTMLElement, postId: string) =>
    findTestButton(root, `job-post-card-${postId}`)

const chooseJobPostAction = async (root: HTMLElement, value: string) => {
    findTestButton(root, 'job-label-trigger').click()
    await vi.waitFor(() =>
        expect(root.querySelector(`[data-testid="job-label-option-${value}"]`)).not.toBeNull(),
    )
    findTestButton(root, `job-label-option-${value}`).click()
}

const expectReportCards = (root: HTMLElement, visibleIds: string[]) => {
    for (const report of reports) {
        expect(root.querySelector(`[data-testid="report-card-${report.id}"]`) !== null).toBe(
            visibleIds.includes(report.id),
        )
    }
}

const getReportDateInputs = (root: HTMLElement) => {
    const from = root.querySelector<HTMLInputElement>('[data-testid="review-date-from"]')
    const to = root.querySelector<HTMLInputElement>('[data-testid="review-date-to"]')

    if (from === null || to === null) {
        throw new Error('Could not find report date range inputs')
    }

    return { from, to }
}

const setDateInput = (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

const mountReview = async (initialUrl = '/', initialState?: HistoryState) => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: ReviewView }],
    })
    await router.push(
        initialState === undefined ? initialUrl : { path: initialUrl, state: initialState },
    )
    await router.isReady()

    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ReviewView)
    app.use(createPinia())
    app.use(router)
    app.mount(root)

    const mountedReview = { app, root, router }
    mountedReviews.push(mountedReview)

    await vi.waitFor(() =>
        expect(root.querySelector(`[data-testid="report-card-${secondReport.id}"]`)).not.toBeNull(),
    )

    return mountedReview
}

describe('review route selection', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(reports)))
        vi.stubGlobal(
            'matchMedia',
            vi.fn((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        )
    })

    afterEach(() => {
        for (const { app, root } of mountedReviews.splice(0)) {
            app.unmount()
            root.remove()
        }

        vi.unstubAllGlobals()
    })

    it('keeps the selected report id out of the visible URL', async () => {
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
        })
    })

    it('filters report posts by review state', async () => {
        const { root } = await mountReview()

        reportButton(root, secondReport.id).click()
        const filter = await vi.waitFor(() => {
            const button = root.querySelector<HTMLButtonElement>(
                '[data-testid="review-post-filter-trigger"]',
            )

            if (button === null) {
                throw new Error('Could not find job post filter')
            }

            return button
        })

        filter.click()

        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="review-post-filter-option-labeled"]'),
            ).not.toBeNull(),
        )
        findTestButton(root, 'review-post-filter-option-labeled').click()

        await vi.waitFor(() => {
            expect(
                root.querySelector(`[data-testid="job-post-card-${labeledPost.id}"]`),
            ).not.toBeNull()
            expect(root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`)).toBeNull()
            expect(root.querySelector(`[data-testid="job-post-card-${forgonePost.id}"]`)).toBeNull()
        })
    })

    it('filters reports by an inclusive open-ended date range and clears it', async () => {
        const { root } = await mountReview()
        const { from, to } = getReportDateInputs(root)

        expect(from.value).toBe('')
        expect(to.value).toBe('')
        expectReportCards(
            root,
            reports.map(({ id }) => id),
        )

        setDateInput(from, '2026-07-15')

        await vi.waitFor(() => {
            expectReportCards(root, [secondReport.id, thirdReport.id])
            expect(to.min).toBe('2026-07-15')
        })

        setDateInput(to, '2026-07-15')

        await vi.waitFor(() => {
            expectReportCards(root, [secondReport.id, thirdReport.id])
            expect(from.max).toBe('2026-07-15')
        })

        setDateInput(from, '')
        setDateInput(to, '2026-07-10')

        await vi.waitFor(() => {
            expectReportCards(root, [firstReport.id])
        })

        findTestButton(root, 'review-date-clear').click()

        await vi.waitFor(() => {
            expect(from.value).toBe('')
            expect(to.value).toBe('')
            expectReportCards(
                root,
                reports.map(({ id }) => id),
            )
        })
    })

    it('explains when no reports fall within the selected date range', async () => {
        const { root } = await mountReview()
        const { from, to } = getReportDateInputs(root)

        setDateInput(from, '2026-07-11')
        setDateInput(to, '2026-07-14')

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="report-empty-state"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="report-list"]')).toBeNull()
        })
    })

    it('keeps the selected report open when the range excludes its card', async () => {
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() => {
            expect(
                root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`),
            ).not.toBeNull()
            expect(router.options.history.state.reviewReportId).toBe(secondReport.id)
        })

        const { to } = getReportDateInputs(root)

        setDateInput(to, '2026-07-10')

        await vi.waitFor(() => {
            expect(root.querySelector(`[data-testid="report-card-${secondReport.id}"]`)).toBeNull()
            expect(
                root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`),
            ).not.toBeNull()
            expect(router.options.history.state.reviewReportId).toBe(secondReport.id)
        })
    })

    it('keeps the selected post id out of the visible URL', async () => {
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`),
            ).not.toBeNull(),
        )
        postButton(root, secondPost.id).click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            })
        })
    })

    it('does not show a failed label update on another selected post', async () => {
        let resolveUpdate: ((response: Response) => void) | undefined
        const updateResponse = new Promise<Response>((resolve) => {
            resolveUpdate = resolve
        })
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(reports))
            .mockReturnValueOnce(updateResponse)
        const { root } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`),
            ).not.toBeNull(),
        )
        postButton(root, secondPost.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(secondPost.id),
        )
        await chooseJobPostAction(root, 'P1')
        await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2))

        findTestButton(root, 'back-to-job-posts').click()
        postButton(root, labeledPost.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(labeledPost.id),
        )
        resolveUpdate?.(jsonResponse({}, 500))

        await vi.waitFor(() =>
            expect(findTestButton(root, 'job-label-trigger').disabled).toBe(false),
        )
        expect(root.querySelector('[data-testid="job-post-error"]')).toBeNull()
    })

    it('removes only the hidden post state when returning to the report posts', async () => {
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`),
            ).not.toBeNull(),
        )
        postButton(root, secondPost.id).click()
        await vi.waitFor(() =>
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            }),
        )

        findTestButton(root, 'back-to-job-posts').click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
            expect(router.options.history.state.reviewPostId).toBeUndefined()
        })
    })

    it('removes hidden selection state when returning to the reports list', async () => {
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() =>
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            }),
        )

        findTestButton(root, 'back-to-reports').click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(router.options.history.state.reviewPostId).toBeUndefined()
        })
    })

    it('restores the selected report and post from hidden history state', async () => {
        const { root, router } = await mountReview('/', {
            reviewReportId: secondReport.id,
            reviewPostId: secondPost.id,
        })

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(secondPost.id)
            expect(reportButton(root, secondReport.id).getAttribute('aria-pressed')).toBe('true')
        })
    })

    it('migrates legacy visible ids into hidden history state', async () => {
        const { root, router } = await mountReview(
            `/?reportId=${secondReport.id}&postId=${secondPost.id}`,
        )

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            })
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(secondPost.id)
        })
    })

    it('removes stale legacy ids from the visible URL', async () => {
        const { root, router } = await mountReview('/?reportId=missing&postId=missing')

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(reportButton(root, firstReport.id).getAttribute('aria-pressed')).toBe('true')
            expect(root.querySelector('[data-testid="job-post-viewer"]')).toBeNull()
        })
    })

    it('keeps valid hidden report state when removing a stale post id', async () => {
        const { root, router } = await mountReview(`/?reportId=${secondReport.id}&postId=missing`)

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(reportButton(root, secondReport.id).getAttribute('aria-pressed')).toBe('true')
            expect(root.querySelector('[data-testid="job-post-viewer"]')).toBeNull()
        })
    })
})
