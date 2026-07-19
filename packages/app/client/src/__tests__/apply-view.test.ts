/** @vitest-environment jsdom */

import type { JobPost, UserLabel, WorkTaskEvent } from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { createApp, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplyView from '../views/ApplyView.vue'

const createPost = (id: string, userLabel: UserLabel): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle: `${userLabel} Engineer`,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    applicationUrl: `https://example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel,
    archivedAt: null,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
})

const posts = [
    createPost('post-p1', 'P1'),
    createPost('post-p2', 'P2'),
    createPost('post-quick-app', 'quick-app'),
]

const runningWorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}

const linkedInActionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'
const linkedInActionRequired = {
    type: 'action-required',
    action: {
        id: linkedInActionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://www.linkedin.com?',
        origin: 'https://www.linkedin.com',
    },
    createdAt: '2026-07-18T12:00:00.000Z',
} satisfies WorkTaskEvent

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

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

    message(event: WorkTaskEvent) {
        this.onmessage?.({ data: JSON.stringify(event) })
    }
}

const mountApplyView = async (pinia: Pinia = createPinia()) => {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ApplyView)
    app.use(pinia)
    app.mount(root)
    mountedApps.push({ app, root })

    await vi.waitFor(() => expect(root.textContent).toContain('P1 Engineer'))

    return root
}

const findButton = (root: HTMLElement, text: string) => {
    const button = [...root.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes(text),
    )

    if (button === undefined) {
        throw new Error(`Could not find button containing "${text}"`)
    }

    return button
}

describe('apply view', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(posts)))
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
        const filter = root.querySelector<HTMLSelectElement>('[aria-label="Filter job posts"]')

        if (filter === null) {
            throw new Error('Could not find job post filter')
        }

        expect([...filter.options].map(({ value }) => value)).toEqual([
            'all',
            'P1',
            'P2',
            'quick-app',
        ])

        filter.value = 'P2'
        filter.dispatchEvent(new Event('change'))

        await vi.waitFor(() => {
            expect(root.textContent).toContain('P2 Engineer')
            expect(root.textContent).not.toContain('P1 Engineer')
            expect(root.textContent).not.toContain('quick-app Engineer')
        })
    })

    it('moves between the post list and viewer', async () => {
        const root = await mountApplyView()
        const list = root.querySelector('.apply-post-list')
        const viewer = root.querySelector('.apply-job-post-view')

        expect(list?.classList.contains('is-active')).toBe(true)
        expect(list?.classList.contains('is-adjacent')).toBe(false)
        expect(viewer?.classList.contains('is-active')).toBe(false)
        expect(viewer?.classList.contains('is-adjacent')).toBe(true)

        findButton(root, 'P2 Engineer').click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(false)
            expect(list?.classList.contains('is-adjacent')).toBe(true)
            expect(viewer?.classList.contains('is-active')).toBe(true)
            expect(viewer?.classList.contains('is-adjacent')).toBe(false)
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(true)
            expect(list?.classList.contains('is-adjacent')).toBe(false)
            expect(viewer?.classList.contains('is-active')).toBe(false)
            expect(viewer?.classList.contains('is-adjacent')).toBe(true)
        })
    })

    it('finds the first engineering contact for the selected company', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, 'Find engineering contact').click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        const taskRequest = fetchMock.mock.calls[2]
        const taskBody = (taskRequest?.[1] as RequestInit | undefined)?.body

        expect(typeof taskBody).toBe('string')

        const taskInput = JSON.parse(taskBody as string) as {
            prompt: string
            outputSchema: { required: string[] }
            capabilities: string[]
        }

        expect(taskRequest?.[0]).toBe('http://localhost:3001/tasks')
        expect(taskInput.prompt).toContain('Example Co')
        expect(taskInput.prompt).toContain('People')
        expect(taskInput.prompt).toContain('Engineering')
        expect(taskInput.outputSchema.required).toEqual(['personName'])
        expect(taskInput.capabilities).toEqual(['chrome'])

        const source = FakeEventSource.instances[0]!
        expect(source.url).toBe(`http://localhost:3001/tasks/${runningWorkTask.id}/events`)

        source.message({
            type: 'activity',
            message: 'Using Chrome',
            createdAt: '2026-07-18T12:00:00.000Z',
        })
        source.message({
            type: 'completed',
            output: { personName: 'Ada Lovelace' },
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        await vi.waitFor(() => {
            expect(root.textContent).toContain('Using Chrome')
            expect(root.textContent).toContain('Ada Lovelace')
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-active')).toBe(
                false,
            )
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to selected job post"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-adjacent')).toBe(
                true,
            )
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-active'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                false,
            )
        })
    })

    it('shows and resolves a required LinkedIn permission without starting another task', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, 'Find engineering contact').click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        const source = FakeEventSource.instances[0]!
        source.message(linkedInActionRequired)

        await vi.waitFor(() => {
            expect(root.textContent).toContain('Action required')
            expect(root.textContent).toContain('Allow Chrome to access https://www.linkedin.com?')
            expect(root.querySelector('textarea')).toBeNull()
            expect(root.querySelector('[aria-label="Back to selected job post"]')).toBeNull()
        })

        findButton(root, 'Allow for this task').click()

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                4,
                `http://localhost:3001/tasks/${runningWorkTask.id}/actions/${linkedInActionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'approve' }),
                },
            )
        })
        expect(FakeEventSource.instances).toHaveLength(1)

        source.message({
            type: 'action-resolved',
            actionId: linkedInActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        await vi.waitFor(() => {
            expect(root.textContent).not.toContain('Allow Chrome to access')
        })
    })

    it('keeps a pending outreach action available after the Apply view remounts', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse(posts))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const root = await mountApplyView(pinia)

        findButton(root, 'P1 Engineer').click()
        findButton(root, 'Find engineering contact').click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        FakeEventSource.instances[0]!.message(linkedInActionRequired)

        const mounted = mountedApps.pop()!
        mounted.app.unmount()
        mounted.root.remove()

        const remountedRoot = await mountApplyView(pinia)

        await vi.waitFor(() => {
            expect(remountedRoot.textContent).toContain('Allow Chrome to access')
            expect(
                remountedRoot.querySelector('.apply-outreach')?.classList.contains('is-active'),
            ).toBe(true)
        })
    })

    it('keeps the loaded list visible when a label update fails', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const root = await mountApplyView()
        const labelPicker = root.querySelector<HTMLSelectElement>('[aria-label="Job post label"]')

        if (labelPicker === null) {
            throw new Error('Could not find job post label picker')
        }

        labelPicker.value = 'P2'
        labelPicker.dispatchEvent(new Event('change'))

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')?.textContent).toBe(
                'API request failed (500)',
            )
        })

        expect(root.querySelector('.apply-post-list .card-list')).not.toBeNull()
    })

    it('removes a post from Apply after it is forgone', async () => {
        const forgonePost = { ...posts[0]!, userLabel: 'forgo' as const }
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse([posts[0]]))
            .mockResolvedValueOnce(jsonResponse(forgonePost))
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()

        const labelPicker = root.querySelector<HTMLSelectElement>('[aria-label="Job post label"]')

        if (labelPicker === null) {
            throw new Error('Could not find job post label picker')
        }

        labelPicker.value = 'forgo'
        labelPicker.dispatchEvent(new Event('change'))

        await vi.waitFor(() => {
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('.apply-job-post-view')).toBeNull()
            expect(root.textContent).toContain('No job posts match this filter.')
        })
    })
})
