/** @vitest-environment jsdom */

import type {
    ApplyQueueItem,
    JobPost,
    JobRecommendationContext,
    OutreachContact,
    UserLabel,
} from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePostStore } from '@/stores/post.store'
import ApplyView from '../views/ApplyView.vue'

const createPost = (id: string, userLabel: UserLabel): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle: `${userLabel} Engineer`,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: `https://example.com/jobs/${id}`,
    applicationUrl: `https://apply.example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userLabel,
    archivedAt: null,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
})

const posts = [
    createPost('30000000-0000-4000-8000-000000000001', 'P1'),
    createPost('30000000-0000-4000-8000-000000000002', 'P2'),
    createPost('30000000-0000-4000-8000-000000000003', 'quick-app'),
]
const createRecommendation = (post: JobPost, index: number): JobRecommendationContext => ({
    reportId: '40000000-0000-4000-8000-000000000001',
    reportDate: '2026-07-16',
    agentRank: index + 1,
    agentLabel: post.userLabel === 'quick-app' ? 'quick-app' : 'target',
    fitRationale: `Fixture fit ${index}`,
    applicationFlow: 'Direct application',
    keyLegitimacySignals: `Fixture signals ${index}`,
    recommendedResume: index === 1 ? 'backend-full-stack' : 'frontend',
    recommendedAction: `Fixture action ${index}`,
    legitimacyNotes: null,
})
const applyQueueItems: ApplyQueueItem[] = posts.map((post, index) => ({
    post,
    recommendationContext: createRecommendation(post, index),
}))
const createApplyQueueItem = (
    post: JobPost,
    recommendationContext: JobRecommendationContext | null = null,
): ApplyQueueItem => ({ post, recommendationContext })

const runningWorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const savedContact: OutreachContact = {
    id: '50000000-0000-4000-8000-000000000001',
    jobPostId: posts[0]!.id,
    personName: 'Grace Hopper',
    personTitle: 'Director of Engineering',
    profileUrl: 'https://www.linkedin.com/in/grace-hopper',
    relevanceRationale: 'Fixture rationale',
    draftMessage: 'Fixture outreach draft',
    messaged: true,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
}

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
const fetchUrl = (input: string | URL | Request) =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

class FakeEventSource {
    static instances: FakeEventSource[] = []

    readonly close = vi.fn()
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this)
    }
}

const findTestButton = (root: HTMLElement, testId: string) => {
    const button = root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)

    if (button === null) {
        throw new Error(`Could not find button "${testId}"`)
    }

    return button
}

const postButton = (root: HTMLElement, postId: string) =>
    findTestButton(root, `job-post-card-${postId}`)

const mountApplyView = async (pinia: Pinia = createPinia()) => {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ApplyView)
    app.use(pinia)
    app.mount(root)
    mountedApps.push({ app, root })

    await vi.waitFor(() =>
        expect(root.querySelector(`[data-testid="job-post-card-${posts[0]!.id}"]`)).not.toBeNull(),
    )

    return root
}

const selectPost = async (root: HTMLElement, postId: string) => {
    postButton(root, postId).click()
    await vi.waitFor(() =>
        expect(
            root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
        ).toBe(postId),
    )
}

const chooseJobPostAction = async (root: HTMLElement, value: string) => {
    const trigger = findTestButton(root, 'job-label-trigger')
    trigger.click()
    await vi.waitFor(() =>
        expect(root.querySelector(`[data-testid="job-label-option-${value}"]`)).not.toBeNull(),
    )
    findTestButton(root, `job-label-option-${value}`).click()
    return trigger
}

describe('apply view', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(applyQueueItems)))
    })

    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }

        vi.unstubAllGlobals()
    })

    it('filters application candidates by user label', async () => {
        const root = await mountApplyView()

        findTestButton(root, 'apply-post-filter-trigger').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="apply-post-filter-option-P2"]'),
            ).not.toBeNull(),
        )
        findTestButton(root, 'apply-post-filter-option-P2').click()

        await vi.waitFor(() => {
            expect(root.querySelector(`[data-testid="job-post-card-${posts[0]!.id}"]`)).toBeNull()
            expect(
                root.querySelector(`[data-testid="job-post-card-${posts[1]!.id}"]`),
            ).not.toBeNull()
            expect(root.querySelector(`[data-testid="job-post-card-${posts[2]!.id}"]`)).toBeNull()
        })
    })

    it('does not admit a fetched post outside the current Apply queue', async () => {
        const outsideQueuePost = createPost('30000000-0000-4000-8000-000000000004', 'P1')
        const pinia = createPinia()
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse(outsideQueuePost))
        const root = await mountApplyView(pinia)

        await usePostStore(pinia).fetchPost(outsideQueuePost.id)
        await nextTick()

        expect(
            root.querySelector(`[data-testid="job-post-card-${outsideQueuePost.id}"]`),
        ).toBeNull()
    })

    it('selects a post and returns to the queue', async () => {
        const root = await mountApplyView()

        await selectPost(root, posts[1]!.id)

        expect(
            root.querySelector('[data-testid="apply-posts-panel"]')?.getAttribute('data-active'),
        ).toBe('false')
        expect(
            root.querySelector('[data-testid="apply-viewer-panel"]')?.getAttribute('data-active'),
        ).toBe('true')
        expect(postButton(root, posts[1]!.id).getAttribute('aria-pressed')).toBe('true')

        findTestButton(root, 'back-to-job-posts').click()

        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="apply-posts-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true'),
        )
    })

    it('reuses saved contacts and navigates between contact and draft panels', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
            ).not.toBeNull(),
        )
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(
            root.querySelector('[data-testid="apply-outreach-panel"]')?.getAttribute('data-active'),
        ).toBe('true')

        findTestButton(root, `outreach-contact-${savedContact.id}-select`).click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-draft"]')).not.toBeNull(),
        )

        findTestButton(root, 'back-to-saved-contacts').click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-contact-list"]')).not.toBeNull(),
        )

        findTestButton(root, 'back-to-job-post').click()
        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="apply-viewer-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true'),
        )
    })

    it('moves a first contact discovery into the task stream', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(1)
            expect(root.querySelector('[data-testid="work-progress"]')).not.toBeNull()
            expect(
                root
                    .querySelector('[data-testid="apply-outreach-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true')
        })
    })

    it('does not start discovery after the Apply view unmounts', async () => {
        let resolveContacts: ((response: Response) => void) | undefined
        const contactsResponse = new Promise<Response>((resolve) => {
            resolveContacts = resolve
        })
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }
            if (url.endsWith(`/api/job-posts/${posts[0]!.id}/outreach-contacts`)) {
                return contactsResponse
            }
            if (url.endsWith('/health')) {
                return Promise.resolve(
                    jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                )
            }
            if (url.endsWith('/tasks') && init?.method === 'POST') {
                return Promise.resolve(jsonResponse(runningWorkTask, 202))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

        const mounted = mountedApps.pop()

        if (mounted === undefined) {
            throw new Error('Could not find mounted Apply view')
        }

        mounted.app.unmount()
        mounted.root.remove()
        resolveContacts?.(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/health'))).toBe(
            false,
        )
        expect(FakeEventSource.instances).toHaveLength(0)
    })

    it('ignores stale contact lookups when returning to a post', async () => {
        const pendingLookups: Array<{
            postId: string
            resolve: (response: Response) => void
        }> = []
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }

            const post = posts.find(({ id }) =>
                url.endsWith(`/api/job-posts/${id}/outreach-contacts`),
            )

            if (post !== undefined) {
                return new Promise<Response>((resolve) => {
                    pendingLookups.push({ postId: post.id, resolve })
                })
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() => expect(pendingLookups).toHaveLength(1))

        findTestButton(root, 'back-to-job-posts').click()
        await selectPost(root, posts[1]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() => expect(pendingLookups).toHaveLength(2))

        findTestButton(root, 'back-to-job-posts').click()
        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() => expect(pendingLookups).toHaveLength(3))

        pendingLookups[0]!.resolve(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(FakeEventSource.instances).toHaveLength(0)

        pendingLookups[2]!.resolve(jsonResponse([savedContact]))
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
            ).not.toBeNull(),
        )

        pendingLookups[1]!.resolve(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(
            root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
        ).not.toBeNull()
        expect(FakeEventSource.instances).toHaveLength(0)
    })

    it('keeps applied and forgone posts in the filtered queue for the current visit', async () => {
        const forgoSourcePost = {
            ...posts[1]!,
            userLabel: 'P1' as const,
        }
        const appliedPost = {
            ...posts[0]!,
            applicationStatus: 'awaiting-response' as const,
            updatedAt: '2026-07-16T12:00:01.000Z',
        }
        const forgonePost = {
            ...forgoSourcePost,
            userLabel: 'forgo' as const,
            updatedAt: '2026-07-16T12:00:01.000Z',
        }
        let resolveForgo: ((response: Response) => void) | undefined
        const forgoResponse = new Promise<Response>((resolve) => {
            resolveForgo = resolve
        })
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(
                jsonResponse([
                    createApplyQueueItem(posts[0]!),
                    createApplyQueueItem(forgoSourcePost),
                ]),
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    post: appliedPost,
                    inApplyQueue: false,
                }),
            )
            .mockReturnValueOnce(forgoResponse)
        const root = await mountApplyView()

        findTestButton(root, 'apply-post-filter-trigger').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="apply-post-filter-option-P1"]'),
            ).not.toBeNull(),
        )
        findTestButton(root, 'apply-post-filter-option-P1').click()

        await selectPost(root, posts[0]!.id)
        await chooseJobPostAction(root, 'applied')

        await vi.waitFor(() =>
            expect(findTestButton(root, 'job-label-trigger').disabled).toBe(true),
        )
        findTestButton(root, 'back-to-job-posts').click()

        await selectPost(root, forgoSourcePost.id)
        const labelTrigger = await chooseJobPostAction(root, 'forgo')
        await vi.waitFor(() => expect(labelTrigger.disabled).toBe(true))
        resolveForgo?.(
            jsonResponse({
                post: forgonePost,
                inApplyQueue: false,
            }),
        )
        await vi.waitFor(() => expect(labelTrigger.disabled).toBe(false))
        findTestButton(root, 'back-to-job-posts').click()

        await vi.waitFor(() => {
            expect(
                [posts[0]!.id, forgoSourcePost.id].map(
                    (postId) =>
                        root.querySelector(`[data-testid="job-post-card-${postId}"]`) !== null,
                ),
            ).toEqual([true, true])
        })
    })
})
