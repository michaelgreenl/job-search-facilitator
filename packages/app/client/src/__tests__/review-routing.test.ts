/** @vitest-environment jsdom */

import type {
    CreateUserAddedJobPostInput,
    JobPost,
    JobSearchReport,
    UserAddedJobPost,
    WorkTask,
} from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createMemoryHistory, createRouter, type HistoryState, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkStore } from '@/stores/work.store'
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
const userAddedPost = {
    agentLabel: 'target',
    fitRationale: 'Strong TypeScript fit',
    applicationFlow: 'Direct application',
    keyLegitimacySignals: 'Listed on company careers page',
    recommendedResume: 'backend-full-stack',
    recommendedAction: 'Apply',
    legitimacyNotes: null,
    post: createPost('30000000-0000-4000-8000-000000000001', 'User-added Engineer'),
    addedAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
} satisfies UserAddedJobPost
const importOutput = {
    agentLabel: 'target',
    fitRationale: 'Matches the applicant’s TypeScript and Vue experience.',
    applicationFlow: 'Apply through the company careers page.',
    keyLegitimacySignals: 'The role appears on the official company careers page.',
    recommendedResume: 'frontend',
    recommendedAction: 'Apply with the frontend resume.',
    legitimacyNotes: null,
    post: {
        sourceKey: 'example:imported-role',
        roleTitle: 'Imported Engineer',
        company: 'Imported Co',
        location: 'Remote',
        compensation: null,
        techStack: 'TypeScript, Vue',
        postSource: 'Company careers',
        postUrl: 'https://example.com/jobs/imported-role',
        applicationUrl: 'https://apply.example.com/jobs/imported-role',
        postStatus: 'active',
    },
} satisfies CreateUserAddedJobPostInput
const savedImportedPost = {
    ...importOutput,
    post: {
        ...createPost('30000000-0000-4000-8000-000000000002', importOutput.post.roleTitle),
        ...importOutput.post,
    },
    addedAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
} satisfies UserAddedJobPost

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

const getRequest = (input: RequestInfo | URL, init?: RequestInit) => ({
    method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
    url: input instanceof Request ? input.url : String(input),
})

const defaultReviewResponse = (input: RequestInfo | URL, init?: RequestInit) => {
    const { method, url } = getRequest(input, init)

    if (method === 'GET' && url.endsWith('/job-search-reports')) {
        return Promise.resolve(jsonResponse(reports))
    }

    if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
        return Promise.resolve(jsonResponse([userAddedPost]))
    }

    throw new Error(`Unexpected ${method} request: ${url}`)
}

interface MountedReview {
    app: App
    pinia: Pinia
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

const submitJobPostUrl = async (root: HTMLElement, url: string) => {
    findTestButton(root, 'add-job-post').click()
    const input = await vi.waitFor(() => {
        const element = root.querySelector<HTMLInputElement>('[data-testid="job-post-url"]')

        if (element === null) {
            throw new Error('Could not find job post URL input')
        }

        return element
    })
    input.value = url
    input.dispatchEvent(new Event('input', { bubbles: true }))
    findTestButton(root, 'start-job-post-import').click()
}

const mountReview = async (
    initialUrl = '/',
    initialState?: HistoryState,
    waitForReports = true,
) => {
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

    const pinia = createPinia()
    const app = createApp(ReviewView)
    app.use(pinia)
    app.use(router)
    app.mount(root)

    const mountedReview = { app, pinia, root, router }
    mountedReviews.push(mountedReview)

    if (waitForReports) {
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="report-card-${secondReport.id}"]`),
            ).not.toBeNull(),
        )
    }

    return mountedReview
}

describe('review route selection', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(defaultReviewResponse))
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

    it('announces and retries a failed report load', async () => {
        let resolveInitialLoad: ((response: Response) => void) | undefined
        let initialReportRequested = false
        const initialLoad = new Promise<Response>((resolve) => {
            resolveInitialLoad = resolve
        })
        vi.mocked(fetch)
            .mockReset()
            .mockImplementation((input, init) => {
                const { method, url } = getRequest(input, init)

                if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
                    return Promise.resolve(jsonResponse([userAddedPost]))
                }

                if (method === 'GET' && url.endsWith('/job-search-reports')) {
                    if (!initialReportRequested) {
                        initialReportRequested = true
                        return initialLoad
                    }

                    return Promise.resolve(jsonResponse(reports))
                }

                throw new Error(`Unexpected ${method} request: ${url}`)
            })
        const { root } = await mountReview('/', undefined, false)

        await vi.waitFor(() => expect(root.querySelector('[role="status"]')).not.toBeNull())
        resolveInitialLoad?.(jsonResponse({}, 500))
        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
        })

        findTestButton(root, 'review-report-retry').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="report-card-${secondReport.id}"]`),
            ).not.toBeNull(),
        )
    })

    it('keeps user-added posts usable when report loading fails', async () => {
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { url } = getRequest(input, init)

            if (url.endsWith('/job-posts/user-added')) {
                return Promise.resolve(jsonResponse([userAddedPost]))
            }

            if (url.endsWith('/job-search-reports')) {
                return Promise.resolve(jsonResponse({}, 500))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        const { root } = await mountReview('/', undefined, false)

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="review-report-retry"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="user-added-source"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="add-job-post"]')).not.toBeNull()
        })

        findTestButton(root, 'user-added-source').click()

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${userAddedPost.post.id}"]`),
            ).not.toBeNull(),
        )
    })

    it('keeps Added by you outside report date filters and opens its standalone analysis', async () => {
        const { root, router } = await mountReview()
        const { from } = getReportDateInputs(root)

        setDateInput(from, '2026-07-16')

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="report-list"]')).toBeNull()
            expect(root.querySelector('[data-testid="user-added-source"]')).not.toBeNull()
        })

        findTestButton(root, 'user-added-source').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${userAddedPost.post.id}"]`),
            ).not.toBeNull(),
        )
        postButton(root, userAddedPost.post.id).click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(userAddedPost.post.id)
            expect(root.querySelector('[data-testid="post-recommendation"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="post-legitimacy"]')).not.toBeNull()
            expect(router.options.history.state).toMatchObject({
                reviewCollection: 'user-added',
                reviewPostId: userAddedPost.post.id,
            })
            expect(router.options.history.state.reviewReportId).toBeUndefined()
        })
    })

    it('opens the add form and rejects a non-http URL before starting Work', async () => {
        const { pinia, root } = await mountReview()
        const startTask = vi.spyOn(useWorkStore(pinia), 'startTask')

        await submitJobPostUrl(root, 'javascript:alert(1)')

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="job-post-url-error"]')).not.toBeNull()
            expect(startTask).not.toHaveBeenCalled()
        })
    })

    it('saves matching completed Work output and opens the imported user-added post', async () => {
        let postRequestCount = 0
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = getRequest(input, init)

            if (method === 'POST' && url.endsWith('/job-posts')) {
                postRequestCount += 1
                return Promise.resolve(jsonResponse(savedImportedPost))
            }

            return defaultReviewResponse(input, init)
        })
        const { pinia, root, router } = await mountReview()
        const workStore = useWorkStore(pinia)
        const runningTask = {
            id: 'import-task',
            threadId: 'thread',
            turnId: 'turn',
            status: 'running',
            output: null,
            error: null,
        } satisfies WorkTask
        vi.spyOn(workStore, 'startTask').mockImplementation(async () => {
            workStore.task = runningTask
            return runningTask
        })

        await submitJobPostUrl(root, importOutput.post.postUrl)

        await vi.waitFor(() => expect(workStore.startTask).toHaveBeenCalledOnce())

        workStore.task = {
            ...runningTask,
            status: 'completed',
            output: importOutput,
            error: null,
        }

        await vi.waitFor(() => {
            expect(postRequestCount).toBe(1)
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(savedImportedPost.post.id)
            expect(router.options.history.state).toMatchObject({
                reviewCollection: 'user-added',
                reviewPostId: savedImportedPost.post.id,
            })
        })
    })

    it('keeps invalid completed Work output away from persistence and exposes retry', async () => {
        let postRequestCount = 0
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = getRequest(input, init)

            if (method === 'POST' && url.endsWith('/job-posts')) {
                postRequestCount += 1
                return Promise.resolve(jsonResponse(savedImportedPost))
            }

            return defaultReviewResponse(input, init)
        })
        const { pinia, root } = await mountReview()
        const workStore = useWorkStore(pinia)
        const runningTask = {
            id: 'invalid-import-task',
            threadId: 'thread',
            turnId: 'turn',
            status: 'running',
            output: null,
            error: null,
        } satisfies WorkTask
        vi.spyOn(workStore, 'startTask').mockImplementation(async () => {
            workStore.task = runningTask
            return runningTask
        })

        await submitJobPostUrl(root, importOutput.post.postUrl)
        await vi.waitFor(() => expect(workStore.startTask).toHaveBeenCalledOnce())

        workStore.task = {
            ...runningTask,
            status: 'completed',
            output: { unexpected: true },
            error: null,
        }

        await vi.waitFor(() => {
            expect(findTestButton(root, 'retry-job-post-import')).not.toBeNull()
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
            expect(postRequestCount).toBe(0)
        })
    })

    it('keeps a running import intact when cancellation fails and leaves after cancellation', async () => {
        const { pinia, root } = await mountReview()
        const workStore = useWorkStore(pinia)
        const runningTask = {
            id: 'cancel-import-task',
            threadId: 'thread',
            turnId: 'turn',
            status: 'running',
            output: null,
            error: null,
        } satisfies WorkTask
        const cancelledTask = {
            ...runningTask,
            status: 'cancelled',
        } satisfies WorkTask
        vi.spyOn(workStore, 'startTask').mockImplementation(async () => {
            workStore.task = runningTask
            return runningTask
        })
        const cancelTask = vi
            .spyOn(workStore, 'cancelTask')
            .mockRejectedValueOnce(new Error('Could not cancel import'))
            .mockImplementationOnce(async () => {
                workStore.task = cancelledTask
                return cancelledTask
            })

        await submitJobPostUrl(root, importOutput.post.postUrl)
        await vi.waitFor(() => expect(workStore.startTask).toHaveBeenCalledOnce())
        findTestButton(root, 'cancel-job-post-import').click()

        await vi.waitFor(() => {
            expect(cancelTask).toHaveBeenCalledTimes(1)
            expect(root.querySelector('[data-testid="job-post-url"]')).not.toBeNull()
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
        })

        findTestButton(root, 'cancel-job-post-import').click()

        await vi.waitFor(() => {
            expect(cancelTask).toHaveBeenCalledTimes(2)
            expect(root.querySelector('[data-testid="job-post-url"]')).toBeNull()
            expect(root.querySelector('[data-testid="user-added-source"]')).not.toBeNull()
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

    it('shows a label failure only on its originating selected post', async () => {
        let resolveUpdate: ((response: Response) => void) | undefined
        let updateRequestCount = 0
        const updateResponse = new Promise<Response>((resolve) => {
            resolveUpdate = resolve
        })
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = getRequest(input, init)

            if (method === 'GET' && url.endsWith('/job-search-reports')) {
                return Promise.resolve(jsonResponse(reports))
            }

            if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
                return Promise.resolve(jsonResponse([userAddedPost]))
            }

            if (method === 'PATCH' && url.includes('/job-posts/')) {
                updateRequestCount += 1
                return updateRequestCount === 1
                    ? Promise.resolve(jsonResponse({}, 500))
                    : updateResponse
            }

            throw new Error(`Unexpected ${method} request: ${url}`)
        })
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${secondPost.id}"]`),
            ).not.toBeNull(),
        )
        postButton(root, labeledPost.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(labeledPost.id),
        )
        postButton(root, secondPost.id).click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(secondPost.id),
        )
        await chooseJobPostAction(root, 'P1')
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="job-post-error"]')).not.toBeNull(),
        )

        router.back()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(labeledPost.id),
        )
        expect(root.querySelector('[data-testid="job-post-error"]')).toBeNull()

        await chooseJobPostAction(root, 'P2')
        await vi.waitFor(() => expect(updateRequestCount).toBe(2))

        router.forward()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(secondPost.id),
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

    it('restores user-added history and removes only the current navigation level', async () => {
        const { root, router } = await mountReview('/', {
            reviewCollection: 'user-added',
            reviewPostId: userAddedPost.post.id,
        })

        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(userAddedPost.post.id),
        )

        findTestButton(root, 'back-to-job-posts').click()
        await vi.waitFor(() => {
            expect(router.options.history.state.reviewCollection).toBe('user-added')
            expect(router.options.history.state.reviewPostId).toBeUndefined()
        })

        findTestButton(root, 'back-to-reports').click()
        await vi.waitFor(() => {
            expect(router.options.history.state.reviewCollection).toBeUndefined()
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(router.options.history.state.reviewPostId).toBeUndefined()
        })
    })

    it('restores ready user-added history without waiting for reports', async () => {
        let resolveReports: ((response: Response) => void) | undefined
        const pendingReports = new Promise<Response>((resolve) => {
            resolveReports = resolve
        })
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = getRequest(input, init)

            if (method === 'GET' && url.endsWith('/job-search-reports')) {
                return pendingReports
            }

            if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
                return Promise.resolve(jsonResponse([userAddedPost]))
            }

            throw new Error(`Unexpected ${method} request: ${url}`)
        })
        const { root } = await mountReview(
            '/',
            {
                reviewCollection: 'user-added',
                reviewPostId: userAddedPost.post.id,
            },
            false,
        )

        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(userAddedPost.post.id),
        )

        resolveReports?.(jsonResponse(reports))
        await vi.waitFor(() => {
            expect(
                root.querySelector(`[data-testid="report-card-${firstReport.id}"]`),
            ).not.toBeNull()
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(userAddedPost.post.id)
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
