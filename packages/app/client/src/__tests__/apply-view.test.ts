/** @vitest-environment jsdom */

import type {
    ApplyQueueItem,
    JobPost,
    JobRecommendationContext,
    OutreachContact,
    UserLabel,
} from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOutreachStore } from '@/stores/outreach'
import { usePostStore } from '@/stores/post'
import { useAgentStore } from '@/stores/agent'
import { makeAgentTask } from '@/test/fixtures/agent'
import { makeJobPost, makeRecommendationContext } from '@/test/fixtures/job-post'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestUrl } from '@/test/support/http'
import { mountVue, type MountedVueComponent } from '@/test/support/mount'
import ApplyView from '../views/ApplyView.vue'

const createPost = (id: string, userLabel: UserLabel): JobPost =>
    makeJobPost({
        id,
        roleTitle: `${userLabel} Engineer`,
        userLabel,
        createdAt: '2026-07-16T12:00:00.000Z',
        updatedAt: '2026-07-16T12:00:00.000Z',
    })

const posts = [
    createPost('30000000-0000-4000-8000-000000000001', 'P1'),
    createPost('30000000-0000-4000-8000-000000000002', 'P2'),
    createPost('30000000-0000-4000-8000-000000000003', 'quick-app'),
]
const createRecommendation = (post: JobPost, index: number): JobRecommendationContext =>
    makeRecommendationContext({
        reportId: '40000000-0000-4000-8000-000000000001',
        reportDate: '2026-07-16',
        agentRank: index + 1,
        agentLabel: post.userLabel === 'quick-app' ? 'quick-app' : 'target',
        fitRationale: `Fixture fit ${index}`,
        keyLegitimacySignals: `Fixture signals ${index}`,
        recommendedResume: index === 1 ? 'backend-full-stack' : 'frontend',
        recommendedAction: `Fixture action ${index}`,
    })
const applyQueueItems: ApplyQueueItem[] = posts.map((post, index) => ({
    post,
    jobPostSnapshot: {
        description: `Fixture job description ${index}`,
        sourceUrl: post.postUrl,
        capturedAt: post.updatedAt,
    },
    recommendationContext: createRecommendation(post, index),
    applicationArtifacts: [],
}))
const createApplyQueueItem = (
    post: JobPost,
    recommendationContext: JobRecommendationContext | null = null,
): ApplyQueueItem => ({
    post,
    jobPostSnapshot: null,
    recommendationContext,
    applicationArtifacts: [],
})

const runningAgentTask = makeAgentTask({
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    threadId: 'thread-id',
    turnId: 'turn-id',
})
const savedContact: OutreachContact = makeOutreachContact({
    id: '50000000-0000-4000-8000-000000000001',
    jobPostId: posts[0]!.id,
    personName: 'Grace Hopper',
    personTitle: 'Director of Engineering',
    profileUrl: 'https://www.linkedin.com/in/grace-hopper',
    relevanceRationale: 'Fixture rationale',
    draftMessage: 'Fixture outreach draft',
    messaged: true,
})

const mountedApps: MountedVueComponent[] = []

const findTestButton = (root: HTMLElement, testId: string) => {
    const button = root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)

    if (button === null) {
        throw new Error(`Could not find button "${testId}"`)
    }

    return button
}

const postButton = (root: HTMLElement, postId: string) =>
    findTestButton(root, `job-post-card-${postId}`)

const mountApplyView = async (pinia: Pinia = createPinia(), waitForQueue = true) => {
    const mounted = mountVue(ApplyView, { install: (app) => app.use(pinia) })
    const { root } = mounted
    mountedApps.push(mounted)

    if (waitForQueue) {
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${posts[0]!.id}"]`),
            ).not.toBeNull(),
        )
    }

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
        sessionStorage.clear()
        vi.stubGlobal('crypto', { randomUUID: () => runningAgentTask.id })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(applyQueueItems)))
    })

    afterEach(() => {
        for (const mounted of mountedApps.splice(0)) {
            mounted.unmount()
        }
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

    it('keeps the selected application filter after remounting', async () => {
        vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(applyQueueItems)))
        let root = await mountApplyView()

        findTestButton(root, 'apply-post-filter-trigger').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="apply-post-filter-option-P2"]'),
            ).not.toBeNull(),
        )
        findTestButton(root, 'apply-post-filter-option-P2').click()
        await vi.waitFor(() =>
            expect(root.querySelector(`[data-testid="job-post-card-${posts[0]!.id}"]`)).toBeNull(),
        )

        mountedApps.pop()?.unmount()
        root = await mountApplyView(createPinia(), false)

        await vi.waitFor(() => {
            expect(root.querySelector(`[data-testid="job-post-card-${posts[0]!.id}"]`)).toBeNull()
            expect(
                root.querySelector(`[data-testid="job-post-card-${posts[1]!.id}"]`),
            ).not.toBeNull()
            expect(root.querySelector(`[data-testid="job-post-card-${posts[2]!.id}"]`)).toBeNull()
        })
    })

    it('announces and retries a failed Apply queue load', async () => {
        let resolveInitialLoad: ((response: Response) => void) | undefined
        const initialLoad = new Promise<Response>((resolve) => {
            resolveInitialLoad = resolve
        })
        vi.mocked(fetch)
            .mockReset()
            .mockReturnValueOnce(initialLoad)
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
        const root = await mountApplyView(createPinia(), false)

        await vi.waitFor(() => expect(root.querySelector('[role="status"]')).not.toBeNull())
        resolveInitialLoad?.(jsonResponse({}, 500))
        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
        })

        findTestButton(root, 'job-post-list-retry').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${posts[0]!.id}"]`),
            ).not.toBeNull(),
        )
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
        expect(root.querySelector('[data-testid="post-description"]')).not.toBeNull()
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

    it('restores the selected post when the Apply view remounts', async () => {
        vi.mocked(fetch).mockImplementation(async () => jsonResponse(applyQueueItems))
        const firstRoot = await mountApplyView()

        await selectPost(firstRoot, posts[1]!.id)
        expect(sessionStorage.getItem('job-search-facilitator:apply-selected-post')).toBe(
            posts[1]!.id,
        )
        mountedApps.at(-1)?.unmount()

        const secondRoot = await mountApplyView()

        await vi.waitFor(() =>
            expect(postButton(secondRoot, posts[1]!.id).getAttribute('aria-pressed')).toBe('true'),
        )
    })

    it('uploads and removes a user-selected resume artifact for the selected post', async () => {
        let uploadRequest: RequestInit | undefined
        let removeRequest: RequestInit | undefined
        const resume = new File(['%PDF-1.7 fixture'], 'frontend-resume.pdf', {
            type: 'application/pdf',
        })
        vi.mocked(fetch).mockImplementation(async (input, init) => {
            const url = requestUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return jsonResponse(applyQueueItems)
            }

            if (
                url.endsWith(`/api/job-posts/${posts[0]!.id}/artifacts/resume`) &&
                init?.method === 'PUT'
            ) {
                uploadRequest = init
                return jsonResponse({
                    kind: 'resume',
                    fileName: resume.name,
                    mediaType: resume.type,
                    sizeBytes: resume.size,
                    uploadedAt: '2026-08-05T20:00:00.000Z',
                })
            }

            if (
                url.endsWith(`/api/job-posts/${posts[0]!.id}/artifacts/resume`) &&
                init?.method === 'DELETE'
            ) {
                removeRequest = init
                return new Response(null, { status: 204 })
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        const input = root.querySelector<HTMLInputElement>('[data-testid="resume-artifact-input"]')!
        Object.defineProperty(input, 'files', { configurable: true, value: [resume] })
        input.dispatchEvent(new Event('change', { bubbles: true }))

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="remove-resume-artifact"]')).not.toBeNull(),
        )
        expect(uploadRequest?.method).toBe('PUT')
        expect(uploadRequest?.body).toBe(resume)
        expect(new Headers(uploadRequest?.headers).get('x-artifact-filename')).toBe(
            encodeURIComponent(resume.name),
        )

        findTestButton(root, 'remove-resume-artifact').click()

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="resume-artifact-input"]')).not.toBeNull(),
        )
        expect(removeRequest?.method).toBe('DELETE')
    })

    it('reuses saved contacts and navigates between contact and draft panels', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
        FakeEventSource.reset()
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

    it('saves an edited outreach draft before reopening it', async () => {
        const draftMessage = 'Hi Grace, could we briefly discuss the role?'
        const updatedContact = { ...savedContact, draftMessage }
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse(updatedContact))
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
            ).not.toBeNull(),
        )
        findTestButton(root, `outreach-contact-${savedContact.id}-select`).click()

        const draft = await vi.waitFor(() => {
            const field = root.querySelector<HTMLTextAreaElement>('#outreach-message')

            if (field === null) {
                throw new Error('Could not find outreach message')
            }

            return field
        })
        draft.value = draftMessage
        draft.dispatchEvent(new Event('input'))
        await nextTick()
        findTestButton(root, 'save-outreach-draft').click()

        await vi.waitFor(() =>
            expect(findTestButton(root, 'save-outreach-draft').disabled).toBe(true),
        )
        const saveRequest = vi
            .mocked(fetch)
            .mock.calls.find(
                ([input, init]) =>
                    requestUrl(input).endsWith(`/outreach-contacts/${savedContact.id}`) &&
                    init?.method === 'PATCH',
            )
        expect(saveRequest?.[1]?.body).toBe(JSON.stringify({ draftMessage }))

        findTestButton(root, 'back-to-saved-contacts').click()
        const savedContactButton = await vi.waitFor(() =>
            findTestButton(root, `outreach-contact-${savedContact.id}-select`),
        )
        savedContactButton.click()
        await vi.waitFor(() =>
            expect(root.querySelector<HTMLTextAreaElement>('#outreach-message')?.value).toBe(
                draftMessage,
            ),
        )
    })

    it('preserves navigation without exposing stale contacts across saved-contact load outcomes', async () => {
        let resolveRetry: ((response: Response) => void) | undefined
        let resolveFailedReload: ((response: Response) => void) | undefined
        const retryResponse = new Promise<Response>((resolve) => {
            resolveRetry = resolve
        })
        const failedReloadResponse = new Promise<Response>((resolve) => {
            resolveFailedReload = resolve
        })
        const pinia = createPinia()
        const outreachStore = useOutreachStore(pinia)
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse({}, 500))
            .mockReturnValueOnce(retryResponse)
            .mockReturnValueOnce(failedReloadResponse)
        const root = await mountApplyView(pinia)
        outreachStore.openForPost(posts[0]!.id)
        outreachStore.contacts = [savedContact]

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() => {
            expect(
                root.querySelector('[data-testid="outreach-contacts-error"]')?.getAttribute('role'),
            ).toBe('alert')
        })

        findTestButton(root, 'outreach-contacts-retry').click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-contacts-loading"]')).not.toBeNull(),
        )
        expect(
            root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
        ).toBeNull()

        findTestButton(root, 'back-to-job-post').click()
        resolveRetry?.(jsonResponse([savedContact]))
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-contacts-loading"]')).toBeNull(),
        )
        expect(
            root.querySelector('[data-testid="apply-viewer-panel"]')?.getAttribute('data-active'),
        ).toBe('true')

        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-contacts-loading"]')).not.toBeNull(),
        )
        findTestButton(root, 'back-to-job-post').click()
        resolveFailedReload?.(jsonResponse({}, 500))
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-contacts-loading"]')).toBeNull(),
        )
        expect(
            root.querySelector('[data-testid="apply-viewer-panel"]')?.getAttribute('data-active'),
        ).toBe('true')
    })

    it('shows an Agent failure while revising an outreach draft', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse({ error: 'Agent bridge unavailable' }, 503))
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
            ).not.toBeNull(),
        )
        findTestButton(root, `outreach-contact-${savedContact.id}-select`).click()

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-draft-request"]')).not.toBeNull(),
        )

        const request = root.querySelector<HTMLTextAreaElement>(
            '[data-testid="outreach-draft-request"]',
        )!
        request.value = 'Make the introduction warmer'
        request.dispatchEvent(new Event('input'))
        await nextTick()
        findTestButton(root, 'outreach-draft-submit').click()

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="back-to-saved-contacts"]')).not.toBeNull()
        })
    })

    it('keeps a disconnected draft task in the draft panel', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningAgentTask, 202))
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const root = await mountApplyView(pinia)

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${savedContact.id}-select"]`),
            ).not.toBeNull(),
        )
        findTestButton(root, `outreach-contact-${savedContact.id}-select`).click()

        const request = await vi.waitFor(() => {
            const input = root.querySelector<HTMLTextAreaElement>(
                '[data-testid="outreach-draft-request"]',
            )

            if (input === null) {
                throw new Error('Could not find the draft request input')
            }

            return input
        })
        request.value = 'Make the introduction warmer'
        request.dispatchEvent(new Event('input'))
        await nextTick()
        findTestButton(root, 'outreach-draft-submit').click()

        const source = await vi.waitFor(() => {
            const instance = FakeEventSource.instances[0]

            if (instance === undefined) {
                throw new Error('Could not find the Agent event stream')
            }

            return instance
        })
        source.open()
        expect(useAgentStore(pinia).getSession(runningAgentTask.id)).toMatchObject({
            kind: 'outreach-draft',
            jobDescription: 'Fixture job description 0',
        })
        expect(root.querySelector('[data-testid="back-to-saved-contacts"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="agent-progress"]')).toBeNull()
        source.disconnect()

        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="outreach-draft-reconnect"]')
                    ?.getAttribute('role'),
            ).toBe('status'),
        )

        source.open()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-draft-reconnect"]')).toBeNull(),
        )

        source.fail()
        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="agent-progress"]')).toBeNull()
        })
    })

    it('only exposes cancellation after contact discovery starts running', async () => {
        let resolveHealth: ((response: Response) => void) | undefined
        const healthResponse = new Promise<Response>((resolve) => {
            resolveHealth = resolve
        })
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockReturnValueOnce(healthResponse)
            .mockResolvedValueOnce(jsonResponse(runningAgentTask, 202))
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="outreach-task-status"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="outreach-cancel"]')).toBeNull()
        })

        resolveHealth?.(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(1)
            expect(root.querySelector('[data-testid="agent-progress"]')).not.toBeNull()
            expect(root.querySelector('[data-testid="outreach-cancel"]')).not.toBeNull()
            expect(
                root
                    .querySelector('[data-testid="apply-outreach-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true')
        })
    })

    it('starts contact discovery while a persisted job import task is active', async () => {
        const importTaskId = 'f67f9fe5-e502-4d28-8c72-c044f1babbb4'
        const runningImportTask = { ...runningAgentTask, id: importTaskId }
        sessionStorage.setItem(
            'job-search-facilitator:agent-session',
            JSON.stringify({
                version: 2,
                sessions: [
                    {
                        kind: 'job-post-import',
                        taskId: importTaskId,
                        url: 'https://example.com/jobs/import',
                    },
                ],
            }),
        )
        vi.mocked(fetch)
            .mockReset()
            .mockImplementation((input, init) => {
                const url = requestUrl(input)

                if (url.endsWith(`/tasks/${importTaskId}`) && init?.method === undefined) {
                    return Promise.resolve(jsonResponse(runningImportTask))
                }

                if (url.endsWith('/api/job-posts/apply-queue')) {
                    return Promise.resolve(jsonResponse(applyQueueItems))
                }

                if (url.endsWith(`/api/job-posts/${posts[0]!.id}/outreach-contacts`)) {
                    return Promise.resolve(jsonResponse([]))
                }

                if (url.endsWith('/health')) {
                    return Promise.resolve(
                        jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                    )
                }

                if (url.endsWith(`/tasks/${runningAgentTask.id}`) && init?.method === 'PUT') {
                    return Promise.resolve(jsonResponse(runningAgentTask, 202))
                }

                throw new Error(`Unexpected request: ${url}`)
            })
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const agentStore = useAgentStore(pinia)
        await agentStore.restoreTask(importTaskId)
        const root = await mountApplyView(pinia)

        expect(agentStore.getSession(importTaskId)).toMatchObject({
            kind: 'job-post-import',
            taskId: importTaskId,
        })
        expect(agentStore.getTaskState(importTaskId)).toMatchObject({
            task: runningImportTask,
        })
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(FakeEventSource.instances[0]?.url).toBe(
            `http://127.0.0.1:3001/tasks/${importTaskId}/events`,
        )

        await selectPost(root, posts[0]!.id)
        expect(findTestButton(root, 'discover-contacts').disabled).toBe(false)
        findTestButton(root, 'discover-contacts').click()

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(2)
            expect(agentStore.getSession(importTaskId)).toMatchObject({
                kind: 'job-post-import',
                taskId: importTaskId,
            })
            expect(agentStore.getTaskState(importTaskId)).toMatchObject({
                task: runningImportTask,
            })
            expect(agentStore.getSession(runningAgentTask.id)).toMatchObject({
                kind: 'outreach-contact',
                taskId: runningAgentTask.id,
                postId: posts[0]!.id,
            })
            expect(agentStore.getTaskState(runningAgentTask.id)?.task).toMatchObject(
                runningAgentTask,
            )
            expect(FakeEventSource.instances.map(({ url }) => url)).toEqual([
                `http://127.0.0.1:3001/tasks/${importTaskId}/events`,
                `http://127.0.0.1:3001/tasks/${runningAgentTask.id}/events`,
            ])
        })
    })

    it('restores the contact list without restoring a cancelled outreach task', async () => {
        sessionStorage.setItem('job-search-facilitator:outreach-contact-list-return', posts[0]!.id)
        vi.mocked(fetch).mockImplementation((input) => {
            const url = requestUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }

            if (url.endsWith(`/api/job-posts/${posts[0]!.id}/outreach-contacts`)) {
                return Promise.resolve(jsonResponse([]))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await vi.waitFor(() => {
            expect(
                root
                    .querySelector('[data-testid="apply-outreach-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true')
            expect(root.querySelector('[data-testid="outreach-contact-list"]')).not.toBeNull()
            expect(findTestButton(root, 'back-to-job-post')).not.toBeNull()
        })

        expect(
            sessionStorage.getItem('job-search-facilitator:outreach-contact-list-return'),
        ).toBeNull()
        expect(sessionStorage.getItem('job-search-facilitator:agent-session')).toBeNull()
    })

    it('shows active outreach in the viewer while preserving its task session', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningAgentTask, 202))
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const root = await mountApplyView(pinia)

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-cancel"]')).not.toBeNull(),
        )
        findTestButton(root, 'back-to-saved-contacts').click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-contact-list"]')).not.toBeNull(),
        )
        expect(root.querySelector('[data-testid="outreach-loading-spinner"]')).toBeNull()

        findTestButton(root, 'back-to-job-post').click()
        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="apply-viewer-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true'),
        )
        expect(findTestButton(root, 'back-to-job-posts')).not.toBeNull()
        expect(findTestButton(root, 'discover-contacts').getAttribute('aria-busy')).toBe('true')
        expect(root.querySelector('[data-testid="outreach-loading-spinner"]')).not.toBeNull()

        findTestButton(root, 'back-to-job-posts').click()
        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="apply-posts-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true'),
        )

        expect(useAgentStore(pinia).getSession(runningAgentTask.id)).toMatchObject({
            taskId: runningAgentTask.id,
            postId: posts[0]!.id,
        })
        expect(sessionStorage.getItem('job-search-facilitator:agent-session')).not.toBeNull()
    })

    it('replaces outreach cancellation with a retry that starts a new task', async () => {
        const retryTask = makeAgentTask({
            id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb4',
            threadId: 'retry-thread-id',
            turnId: 'retry-turn-id',
        })
        vi.stubGlobal('crypto', {
            randomUUID: vi
                .fn()
                .mockReturnValueOnce(runningAgentTask.id)
                .mockReturnValueOnce(retryTask.id),
        })
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningAgentTask, 202))
            .mockResolvedValueOnce(jsonResponse({ ...runningAgentTask, status: 'cancelled' }, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(retryTask, 202))
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const root = await mountApplyView(pinia)

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-cancel"]')).not.toBeNull(),
        )

        findTestButton(root, 'outreach-cancel').click()

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="outreach-cancel"]')).toBeNull()
            expect(root.querySelector('[data-testid="outreach-retry"]')).not.toBeNull()
        })

        findTestButton(root, 'outreach-retry').click()

        await vi.waitFor(() => {
            expect(root.querySelector('[data-testid="outreach-retry"]')).toBeNull()
            expect(root.querySelector('[data-testid="outreach-cancel"]')).not.toBeNull()
            expect(useAgentStore(pinia).getSession(retryTask.id)?.taskId).toBe(retryTask.id)
        })
    })

    it('keeps a restored task reachable when its owner post cannot be loaded', async () => {
        const missingPostId = '30000000-0000-4000-8000-000000000099'
        sessionStorage.setItem(
            'job-search-facilitator:agent-session',
            JSON.stringify({
                version: 1,
                session: {
                    kind: 'outreach-contact',
                    taskId: runningAgentTask.id,
                    postId: missingPostId,
                },
            }),
        )
        vi.mocked(fetch).mockImplementation((input) => {
            const url = requestUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }

            if (url.endsWith(`/api/job-posts/${missingPostId}`)) {
                return Promise.resolve(jsonResponse({}, 500))
            }

            if (url.endsWith(`/api/job-posts/${missingPostId}/outreach-contacts`)) {
                return Promise.resolve(jsonResponse([]))
            }

            if (url.endsWith(`/tasks/${runningAgentTask.id}`)) {
                return Promise.resolve(jsonResponse(runningAgentTask))
            }

            if (url.endsWith(`/tasks/${runningAgentTask.id}/cancel`)) {
                return Promise.resolve(
                    jsonResponse({ ...runningAgentTask, status: 'cancelled' }, 202),
                )
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        await useAgentStore(pinia).restoreSessions()
        const root = await mountApplyView(pinia)

        await vi.waitFor(() => {
            expect(
                root
                    .querySelector('[data-testid="apply-outreach-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true')
            expect(root.querySelector('[data-testid="outreach-cancel"]')).not.toBeNull()
        })

        findTestButton(root, 'outreach-cancel').click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="back-to-saved-contacts"]')).not.toBeNull(),
        )
        findTestButton(root, 'back-to-saved-contacts').click()

        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="apply-posts-panel"]')
                    ?.getAttribute('data-active'),
            ).toBe('true'),
        )
    })

    it('does not start discovery after the Apply view unmounts', async () => {
        let resolveContacts: ((response: Response) => void) | undefined
        const contactsResponse = new Promise<Response>((resolve) => {
            resolveContacts = resolve
        })
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = requestUrl(input)

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
                return Promise.resolve(jsonResponse(runningAgentTask, 202))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        findTestButton(root, 'discover-contacts').click()
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

        const mounted = mountedApps.pop()

        if (mounted === undefined) {
            throw new Error('Could not find mounted Apply view')
        }

        mounted.unmount()
        resolveContacts?.(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith('/health'))).toBe(
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
            const url = requestUrl(input)

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
        FakeEventSource.reset()
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

    it('shows a label failure only on its originating selected post', async () => {
        let resolveUpdate: ((response: Response) => void) | undefined
        const updateResponse = new Promise<Response>((resolve) => {
            resolveUpdate = resolve
        })
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse({}, 500))
            .mockReturnValueOnce(updateResponse)
        const root = await mountApplyView()

        await selectPost(root, posts[0]!.id)
        await chooseJobPostAction(root, 'P2')
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="job-post-error"]')).not.toBeNull(),
        )

        findTestButton(root, 'apply-post-filter-trigger').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="apply-post-filter-option-P2"]'),
            ).not.toBeNull(),
        )
        findTestButton(root, 'apply-post-filter-option-P2').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(posts[1]!.id),
        )
        expect(root.querySelector('[data-testid="job-post-error"]')).toBeNull()

        await chooseJobPostAction(root, 'quick-app')
        await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3))

        findTestButton(root, 'apply-post-filter-trigger').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="apply-post-filter-option-P1"]'),
            ).not.toBeNull(),
        )
        findTestButton(root, 'apply-post-filter-option-P1').click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="job-post-viewer"]')?.getAttribute('data-post-id'),
            ).toBe(posts[0]!.id),
        )
        resolveUpdate?.(jsonResponse({}, 500))

        await vi.waitFor(() =>
            expect(findTestButton(root, 'job-label-trigger').disabled).toBe(false),
        )
        expect(root.querySelector('[data-testid="job-post-error"]')).toBeNull()
    })
})
