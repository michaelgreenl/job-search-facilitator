/** @vitest-environment jsdom */

import type {
    CreateUserAddedJobPostInput,
    JobPost,
    JobSearchReport,
    UserAddedJobPost,
    AgentTask,
} from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type HistoryState, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJobPostImportTask } from '@/stores/job-post-import'
import { useAgentStore, type AgentSession } from '@/stores/agent'
import { makeAgentTask, makeAgentTaskState } from '@/test/fixtures/agent'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeJobSearchReport } from '@/test/fixtures/report'
import { jsonResponse, requestParts } from '@/test/support/http'
import { installMatchMedia } from '@/test/support/match-media'
import { mountVue, type MountedVueComponent } from '@/test/support/mount'
import ReviewView from '../views/ReviewView.vue'

const createPost = (id: string, roleTitle: string): JobPost =>
    makeJobPost({
        id,
        roleTitle,
        createdAt: '2026-07-15T12:00:00.000Z',
        updatedAt: '2026-07-15T12:00:00.000Z',
    })

const createReport = (
    id: string,
    reportDate: string,
    summary: string,
    post: JobPost,
): JobSearchReport => {
    const report = makeJobSearchReport({ id, reportDate, summary }, post)

    return {
        ...report,
        results: report.results.map((result) => ({
            ...result,
            fitRationale: 'Strong TypeScript fit',
            keyLegitimacySignals: 'Listed on company careers page',
        })),
    }
}

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

const defaultReviewResponse = (input: RequestInfo | URL, init?: RequestInit) => {
    const { method, url } = requestParts(input, init)

    if (method === 'GET' && url.endsWith('/job-search-reports')) {
        return Promise.resolve(jsonResponse(reports))
    }

    if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
        return Promise.resolve(jsonResponse([userAddedPost]))
    }

    throw new Error(`Unexpected ${method} request: ${url}`)
}

interface MountedReview extends MountedVueComponent {
    pinia: Pinia
    router: Router
}

const mountedReviews: MountedReview[] = []
type AgentStore = ReturnType<typeof useAgentStore>

const seedImportAgent = (
    agentStore: AgentStore,
    task: AgentTask,
    url = importOutput.post.postUrl,
) => {
    const session = {
        kind: 'job-post-import',
        taskId: task.id,
        url,
    } satisfies AgentSession

    agentStore.sessions = [
        ...agentStore.sessions.filter(({ kind }) => kind !== 'job-post-import'),
        session,
    ]
    agentStore.taskStates = {
        ...agentStore.taskStates,
        [task.id]: makeAgentTaskState(task),
    }
}

const updateImportAgentTask = (agentStore: AgentStore, task: AgentTask) => {
    const session = agentStore.getSession('job-post-import')
    const currentState = agentStore.getTaskState(task.id)

    if (session?.taskId !== task.id || currentState === null) {
        throw new Error(`Could not update unseeded import task "${task.id}"`)
    }

    agentStore.taskStates = {
        ...agentStore.taskStates,
        [task.id]: {
            ...currentState,
            task,
            connectionState: task.status === 'running' ? 'connected' : 'closed',
        },
    }
}

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

let viewport: ReturnType<typeof installMatchMedia>

const useLaptopViewport = () => viewport.setWidth(848)

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
    await nextTick()
    const form = root.querySelector<HTMLFormElement>('[data-testid="job-post-url-form"]')

    if (form === null) {
        throw new Error('Could not find job post URL form')
    }

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
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

    const pinia = createPinia()
    const mounted = mountVue(ReviewView, {
        install: (app) => {
            app.use(pinia)
            app.use(router)
        },
    })
    const mountedReview = { ...mounted, pinia, router }
    mountedReviews.push(mountedReview)

    if (waitForReports) {
        await vi.waitFor(() =>
            expect(
                mounted.root.querySelector(`[data-testid="report-card-${secondReport.id}"]`),
            ).not.toBeNull(),
        )
    }

    return mountedReview
}

describe('review route selection', () => {
    beforeEach(() => {
        sessionStorage.clear()
        vi.stubGlobal('fetch', vi.fn(defaultReviewResponse))
        viewport = installMatchMedia(0)
    })

    afterEach(() => {
        for (const mounted of mountedReviews.splice(0)) {
            mounted.unmount()
        }
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
                const { method, url } = requestParts(input, init)

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
            const { url } = requestParts(input, init)

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

    it('opens the add form and rejects a non-http URL before starting Agent', async () => {
        const { pinia, root } = await mountReview()
        const startTask = vi.spyOn(useAgentStore(pinia), 'startTask')

        await submitJobPostUrl(root, 'javascript:alert(1)')

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="job-post-url-error"]')).not.toBeNull()
            expect(startTask).not.toHaveBeenCalled()
        })
    })

    it('normalizes and starts a job-post import while a persisted outreach task remains active', async () => {
        class SilentEventSource {
            static readonly CLOSED = 2
            readonly readyState = 0
            onopen: (() => void) | null = null
            onmessage: ((event: { data: string }) => void) | null = null
            onerror: (() => void) | null = null
            close() {}
        }

        vi.stubGlobal('EventSource', SilentEventSource)
        const outreachTask = makeAgentTask({
            id: '50000000-0000-4000-8000-000000000001',
            threadId: 'outreach-thread',
            turnId: 'outreach-turn',
        })
        const outreachSession = {
            kind: 'outreach-contact',
            taskId: outreachTask.id,
            postId: firstPost.id,
        } satisfies AgentSession
        const importTaskId = '40000000-0000-4000-8000-000000000001'
        const importTask = makeAgentTask({
            id: importTaskId,
            threadId: 'import-thread',
            turnId: 'import-turn',
        })
        vi.spyOn(crypto, 'randomUUID').mockReturnValue(importTaskId)
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = requestParts(input, init)

            if (method === 'GET' && url.endsWith('/health')) {
                return Promise.resolve(
                    jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                )
            }

            if (method === 'GET' && url.endsWith(`/tasks/${outreachTask.id}`)) {
                return Promise.resolve(jsonResponse(outreachTask))
            }

            if (method === 'PUT' && url.endsWith(`/tasks/${importTask.id}`)) {
                return Promise.resolve(jsonResponse(importTask, 202))
            }

            return defaultReviewResponse(input, init)
        })
        sessionStorage.setItem(
            'job-search-facilitator:agent-session',
            JSON.stringify({ version: 2, sessions: [outreachSession] }),
        )
        const { pinia, root } = await mountReview()
        const agentStore = useAgentStore(pinia)
        await agentStore.restoreTask(outreachTask.id)
        expect(agentStore.getTaskState(outreachTask.id)?.task?.status).toBe('running')
        const startTask = vi.spyOn(agentStore, 'startTask')

        await submitJobPostUrl(root, importOutput.post.postUrl.replace('https://', 'HTTPS://'))

        await vi.waitFor(() => {
            expect(startTask).toHaveBeenCalledWith(
                createJobPostImportTask(importOutput.post.postUrl),
                {
                    kind: 'job-post-import',
                    url: importOutput.post.postUrl,
                },
            )
            expect(agentStore.getSession('job-post-import')).toEqual({
                kind: 'job-post-import',
                taskId: importTask.id,
                url: importOutput.post.postUrl,
            })
            expect(agentStore.getTaskState(importTask.id)?.task).toEqual(importTask)
            expect(agentStore.getSession('outreach')).toEqual(outreachSession)
            expect(agentStore.getTaskState(outreachTask.id)?.task).toEqual(outreachTask)
        })
    })

    it('does not carry an open add-post popup into a fresh view', async () => {
        const firstMount = await mountReview()

        findTestButton(firstMount.root, 'add-job-post').click()
        const input = await vi.waitFor(() => {
            const element = firstMount.root.querySelector<HTMLInputElement>(
                '[data-testid="job-post-url"]',
            )

            if (element === null) {
                throw new Error('Could not find job post URL input')
            }

            return element
        })
        input.value = importOutput.post.postUrl
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()

        firstMount.unmount()
        mountedReviews.splice(mountedReviews.indexOf(firstMount), 1)

        const restoredMount = await mountReview()
        const restoredDialog = restoredMount.root.querySelector<HTMLDialogElement>(
            '[data-testid="job-post-url-dialog"]',
        )

        expect(restoredDialog?.hasAttribute('open')).toBe(false)
        expect(
            restoredMount.root.querySelector<HTMLInputElement>('[data-testid="job-post-url"]')
                ?.value,
        ).toBe('')
    })

    it('does not restore a cancelled import after refresh', async () => {
        class SilentEventSource {
            static readonly CLOSED = 2
            readonly readyState = 0
            onopen: (() => void) | null = null
            onmessage: ((event: { data: string }) => void) | null = null
            onerror: (() => void) | null = null
            close() {}
        }

        vi.stubGlobal('EventSource', SilentEventSource)
        const taskId = crypto.randomUUID()
        vi.spyOn(crypto, 'randomUUID').mockReturnValue(taskId)
        const runningTask = makeAgentTask({
            id: taskId,
            threadId: 'thread',
            turnId: 'turn',
        })
        const cancelledTask = { ...runningTask, status: 'cancelled' } satisfies AgentTask
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = requestParts(input, init)

            if (method === 'GET' && url.endsWith('/health')) {
                return Promise.resolve(
                    jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                )
            }

            if (method === 'PUT' && url.endsWith(`/tasks/${taskId}`)) {
                return Promise.resolve(jsonResponse(runningTask, 202))
            }

            if (method === 'POST' && url.endsWith(`/tasks/${taskId}/cancel`)) {
                return Promise.resolve(jsonResponse(cancelledTask, 202))
            }

            return defaultReviewResponse(input, init)
        })
        const firstPinia = createPinia()
        const firstStore = useAgentStore(firstPinia)

        await firstStore.startTask(
            {
                prompt: 'Import a job post',
                outputSchema: { type: 'object' },
                capabilities: ['chrome'],
            },
            {
                kind: 'job-post-import',
                url: importOutput.post.postUrl,
            },
        )
        await firstStore.cancelTask(taskId)
        expect(sessionStorage.getItem('job-search-facilitator:agent-session')).toBeNull()

        const { root } = await mountReview()

        await vi.waitFor(() => {
            expect(
                root.querySelector('[aria-label="Review sources"]')?.getAttribute('data-active'),
            ).toBe('true')
            expect(root.querySelector('[data-testid="cancel-job-post-import"]')).toBeNull()
        })
    })

    it('saves matching completed Agent output and opens the imported user-added post', async () => {
        let postRequestCount = 0
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = requestParts(input, init)

            if (method === 'POST' && url.endsWith('/job-posts')) {
                postRequestCount += 1
                return Promise.resolve(jsonResponse(savedImportedPost))
            }

            return defaultReviewResponse(input, init)
        })
        const { pinia, root, router } = await mountReview()
        const agentStore = useAgentStore(pinia)
        const runningTask = makeAgentTask({
            id: 'import-task',
            threadId: 'thread',
            turnId: 'turn',
        })
        vi.spyOn(agentStore, 'startTask').mockImplementation(async () => {
            seedImportAgent(agentStore, runningTask)
            return runningTask
        })

        await submitJobPostUrl(root, importOutput.post.postUrl)

        await vi.waitFor(() => expect(agentStore.startTask).toHaveBeenCalledOnce())

        updateImportAgentTask(agentStore, {
            ...runningTask,
            status: 'completed',
            output: importOutput,
            error: null,
        })

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

    it('keeps invalid completed Agent output away from persistence and exposes retry', async () => {
        let postRequestCount = 0
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = requestParts(input, init)

            if (method === 'POST' && url.endsWith('/job-posts')) {
                postRequestCount += 1
                return Promise.resolve(jsonResponse(savedImportedPost))
            }

            return defaultReviewResponse(input, init)
        })
        const { pinia, root } = await mountReview()
        const agentStore = useAgentStore(pinia)
        const runningTask = makeAgentTask({
            id: 'invalid-import-task',
            threadId: 'thread',
            turnId: 'turn',
        })
        vi.spyOn(agentStore, 'startTask').mockImplementation(async () => {
            seedImportAgent(agentStore, runningTask)
            return runningTask
        })

        await submitJobPostUrl(root, importOutput.post.postUrl)
        await vi.waitFor(() => expect(agentStore.startTask).toHaveBeenCalledOnce())

        updateImportAgentTask(agentStore, {
            ...runningTask,
            status: 'completed',
            output: { unexpected: true },
            error: null,
        })

        await vi.waitFor(() => {
            expect(findTestButton(root, 'retry-job-post-import')).not.toBeNull()
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
            expect(postRequestCount).toBe(0)
        })

        findTestButton(root, 'retry-job-post-import').click()
        await vi.waitFor(() => expect(agentStore.startTask).toHaveBeenCalledTimes(2))
    })

    it('shows a selectable in-progress card after leaving a running import', async () => {
        const { pinia, root } = await mountReview()
        const agentStore = useAgentStore(pinia)
        const runningTask = makeAgentTask({
            id: 'visible-import-task',
            threadId: 'thread',
            turnId: 'turn',
        })
        vi.spyOn(agentStore, 'startTask').mockImplementation(async () => {
            seedImportAgent(agentStore, runningTask)
            return runningTask
        })

        await submitJobPostUrl(root, importOutput.post.postUrl)
        await vi.waitFor(() => expect(agentStore.startTask).toHaveBeenCalledOnce())

        findTestButton(root, 'back-from-job-post-import').click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('[aria-label="Job posts"]')?.getAttribute('data-active'),
            ).toBe('true')
            expect(root.querySelector('[data-testid="job-post-import-progress"]')).not.toBeNull()
        })
        findTestButton(root, 'job-post-import-progress').click()

        await vi.waitFor(() => {
            expect(
                root
                    .querySelector('[aria-label="Add job post"][data-active]')
                    ?.getAttribute('data-active'),
            ).toBe('true')
            expect(root.querySelector('[data-testid="cancel-job-post-import"]')).not.toBeNull()
        })
    })

    it('keeps a running import intact when cancellation fails and allows leaving after cancellation', async () => {
        const { pinia, root } = await mountReview()
        const agentStore = useAgentStore(pinia)
        const runningTask = makeAgentTask({
            id: 'cancel-import-task',
            threadId: 'thread',
            turnId: 'turn',
        })
        const cancelledTask = {
            ...runningTask,
            status: 'cancelled',
        } satisfies AgentTask
        vi.spyOn(agentStore, 'startTask').mockImplementation(async () => {
            seedImportAgent(agentStore, runningTask)
            return runningTask
        })
        const cancelTask = vi
            .spyOn(agentStore, 'cancelTask')
            .mockRejectedValueOnce(new Error('Could not cancel import'))
            .mockImplementationOnce(async () => {
                updateImportAgentTask(agentStore, cancelledTask)
                return cancelledTask
            })

        await submitJobPostUrl(root, importOutput.post.postUrl)
        await vi.waitFor(() => expect(agentStore.startTask).toHaveBeenCalledOnce())
        findTestButton(root, 'cancel-job-post-import').click()

        await vi.waitFor(() => {
            expect(cancelTask).toHaveBeenCalledTimes(1)
            expect(cancelTask).toHaveBeenNthCalledWith(1, runningTask.id)
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="cancel-job-post-import"]')).not.toBeNull()
        })

        findTestButton(root, 'cancel-job-post-import').click()

        await vi.waitFor(() => {
            expect(cancelTask).toHaveBeenCalledTimes(2)
            expect(cancelTask).toHaveBeenNthCalledWith(2, runningTask.id)
            expect(
                root.querySelector('[data-testid="job-post-url-dialog"]')?.hasAttribute('open'),
            ).toBe(false)
            expect(root.querySelector('[data-testid="back-from-job-post-import"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="retry-job-post-import"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="cancel-job-post-import"]')).toBeNull()
            expect(
                root
                    .querySelector('[aria-label="Add job post"][data-active]')
                    ?.getAttribute('data-active'),
            ).toBe('true')
        })

        findTestButton(root, 'back-from-job-post-import').click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('[aria-label="Job posts"]')?.getAttribute('data-active'),
            ).toBe('true')
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
            const { method, url } = requestParts(input, init)

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

    it('keeps the selected report when returning to the review sources', async () => {
        useLaptopViewport()
        const { root, router } = await mountReview()

        reportButton(root, secondReport.id).click()
        await vi.waitFor(() =>
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            }),
        )
        postButton(root, secondPost.id).click()
        await vi.waitFor(() =>
            expect(router.options.history.state.reviewPostId).toBe(secondPost.id),
        )

        findTestButton(root, 'back-to-reports').click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state.reviewReportId).toBe(secondReport.id)
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(
                root.querySelector('[aria-label="Review sources"]')?.getAttribute('data-active'),
            ).toBe('true')
            expect(reportButton(root, secondReport.id).getAttribute('aria-pressed')).toBe('true')
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

    it('keeps user-added posts selected when returning from its viewer to review sources', async () => {
        useLaptopViewport()
        const { root, router } = await mountReview('/', {
            reviewCollection: 'user-added',
            reviewPostId: userAddedPost.post.id,
        })

        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(userAddedPost.post.id),
        )

        findTestButton(root, 'back-to-reports').click()
        await vi.waitFor(() => {
            expect(router.options.history.state.reviewCollection).toBe('user-added')
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(
                root.querySelector('[aria-label="Review sources"]')?.getAttribute('data-active'),
            ).toBe('true')
            expect(findTestButton(root, 'user-added-source').getAttribute('aria-pressed')).toBe(
                'true',
            )
            expect(
                root.querySelector(`[data-testid="job-post-card-${userAddedPost.post.id}"]`),
            ).not.toBeNull()
        })
    })

    it('restores ready user-added history without waiting for reports', async () => {
        let resolveReports: ((response: Response) => void) | undefined
        const pendingReports = new Promise<Response>((resolve) => {
            resolveReports = resolve
        })
        vi.mocked(fetch).mockImplementation((input, init) => {
            const { method, url } = requestParts(input, init)

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
