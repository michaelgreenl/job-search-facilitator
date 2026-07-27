import type { StartWorkTaskInput, WorkTask, WorkTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkStore } from '../stores/work.store'

class FakeEventSource {
    static instances: FakeEventSource[] = []
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2

    readonly close = vi.fn(() => {
        this.readyState = FakeEventSource.CLOSED
    })
    readyState: number = FakeEventSource.CONNECTING
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this)
    }

    open() {
        this.readyState = FakeEventSource.OPEN
        this.onopen?.()
    }

    message(event: WorkTaskEvent) {
        this.onmessage?.({ data: JSON.stringify(event) })
    }

    rawMessage(value: unknown) {
        this.onmessage?.({ data: JSON.stringify(value) })
    }

    disconnect(readyState = FakeEventSource.CONNECTING) {
        this.readyState = readyState
        this.onerror?.()
    }
}

const startedTask: WorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const nextTask: WorkTask = {
    ...startedTask,
    id: 'a8314bdd-2a1c-48f3-8982-a57fd8b04f5c',
    threadId: 'next-thread-id',
    turnId: 'next-turn-id',
}

const taskInput = {
    prompt: 'Read Example Domain',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
} satisfies StartWorkTaskInput
const firstActionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'
const firstActionRequired = {
    type: 'action-required',
    action: {
        id: firstActionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://www.linkedin.com?',
        origin: 'https://www.linkedin.com',
    },
    createdAt: '2026-07-18T12:00:00.000Z',
} satisfies WorkTaskEvent
const secondActionId = 'b110f66c-b31c-4db5-90ad-89ac670d6ce0'
const secondActionRequired = {
    type: 'action-required',
    action: {
        id: secondActionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://example.com?',
        origin: 'https://example.com',
    },
    createdAt: '2026-07-18T12:00:02.000Z',
} satisfies WorkTaskEvent

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

describe('work store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('keeps a running task active while its event stream reconnects', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)

        expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:3001/health', undefined)
        expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3001/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskInput),
        })
        expect(FakeEventSource.instances).toHaveLength(1)

        const source = FakeEventSource.instances[0]!
        expect(source.url).toBe(`http://localhost:3001/tasks/${startedTask.id}/events`)

        source.open()
        source.message({
            type: 'activity',
            message: 'Using Chrome',
            createdAt: '2026-07-18T12:00:00.000Z',
        })
        source.disconnect()

        expect(store.connectionState).toBe('reconnecting')
        expect(store.task?.status).toBe('running')
        expect(source.close).not.toHaveBeenCalled()

        source.open()
        source.message({
            type: 'completed',
            output: {
                url: 'https://example.com/',
                title: 'Example Domain',
            },
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        expect(store.connectionState).toBe('closed')
        expect(store.task).toMatchObject({
            status: 'completed',
            output: { title: 'Example Domain' },
        })
        expect(store.events.map(({ type }) => type)).toEqual(['activity', 'completed'])
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('rejects an invalid health response before creating a task or event stream', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'ready', capabilities: ['chrome'] }))
        const store = useWorkStore()

        await expect(store.startTask(taskInput)).rejects.toThrow(
            'Work /health returned invalid data',
        )

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(store.task).toBeNull()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.connectionState).toBe('disconnected')
    })

    it('rejects a contradictory task response before opening its event stream', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(
                jsonResponse({ ...startedTask, status: 'completed', output: null }, 202),
            )
        const store = useWorkStore()

        await expect(store.startTask(taskInput)).rejects.toThrow(
            'Work /tasks returned invalid data',
        )

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(store.task).toBeNull()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.connectionState).toBe('disconnected')
    })

    it('releases a task when the event stream violates its contract', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.open()
        source.rawMessage({
            type: 'completed',
            output: [],
            createdAt: '2026-07-18T12:00:00.000Z',
        })

        expect(store.task).toEqual({
            ...startedTask,
            status: 'failed',
            error: 'Work stream returned invalid data',
        })
        expect(store.taskActive).toBe(false)
    })

    it('releases a task after its event stream closes permanently', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.disconnect(FakeEventSource.CLOSED)

        expect(store.task).toEqual({
            ...startedTask,
            status: 'failed',
            error: 'Work stream closed before the task finished',
        })
        expect(store.taskActive).toBe(false)
    })

    it('cancels a running task and closes its event stream', async () => {
        const cancelledTask: WorkTask = { ...startedTask, status: 'cancelled' }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.open()

        await expect(store.cancelTask()).resolves.toEqual(cancelledTask)

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3001/tasks/${startedTask.id}/cancel`,
            { method: 'POST' },
        )
        expect(store.task?.status).toBe('cancelled')
        expect(store.connectionState).toBe('closed')
        expect(store.cancelling).toBe(false)
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('keeps a running task available when cancellation fails', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.open()

        await expect(store.cancelTask()).rejects.toThrow('Work request failed (500)')

        expect(store.task).toEqual(startedTask)
        expect(store.taskActive).toBe(true)
        expect(store.cancelling).toBe(false)
        expect(store.error).toBe('Work request failed (500)')
        expect(store.connectionState).toBe('connected')
        expect(source.close).not.toHaveBeenCalled()
    })

    it('does not create a task when the requested capability is unavailable', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: [] }))
        const store = useWorkStore()

        await expect(store.startTask(taskInput)).rejects.toThrow(
            'Work capability is unavailable: chrome',
        )

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.connectionState).toBe('disconnected')
        expect(store.error).toBe('Work capability is unavailable: chrome')
    })

    it('resumes the same task after a required browser action is approved', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message(firstActionRequired)

        expect(store.pendingAction?.origin).toBe('https://www.linkedin.com')

        await store.resolveAction('approve')

        expect(store.actionSubmitting).toBe(true)
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3001/tasks/${startedTask.id}/actions/${firstActionId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: 'approve' }),
            },
        )
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(source.close).not.toHaveBeenCalled()

        source.message({
            type: 'action-resolved',
            actionId: firstActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        expect(store.actionSubmitting).toBe(false)
        source.message({
            type: 'completed',
            output: { personName: 'Ada Lovelace' },
            createdAt: '2026-07-18T12:00:02.000Z',
        })

        expect(store.pendingAction).toBeNull()
        expect(store.task?.output).toEqual({ personName: 'Ada Lovelace' })
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('asks again after an always-allowed task completes', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const firstSource = FakeEventSource.instances[0]!
        firstSource.message(firstActionRequired)

        await store.allowBrowserActionsForTask()
        firstSource.message({
            type: 'action-resolved',
            actionId: firstActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })
        expect(store.alwaysAllowBrowserActions).toBe(true)

        firstSource.message({
            type: 'completed',
            output: { title: 'First task complete' },
            createdAt: '2026-07-18T12:00:02.000Z',
        })
        expect(store.alwaysAllowBrowserActions).toBe(false)

        await store.startTask(taskInput)

        const secondSource = FakeEventSource.instances[1]!
        secondSource.message(secondActionRequired)

        expect(store.pendingAction?.id).toBe(secondActionId)
        expect(store.alwaysAllowBrowserActions).toBe(false)
        expect(store.actionNeedsAttention).toBe(true)
    })

    it('automatically approves later browser actions for the same task', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.message(firstActionRequired)
        await store.allowBrowserActionsForTask()
        source.message({
            type: 'action-resolved',
            actionId: firstActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        source.message(secondActionRequired)

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                4,
                `http://localhost:3001/tasks/${startedTask.id}/actions/${secondActionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'approve' }),
                },
            )
        })
        expect(store.pendingAction?.id).toBe(secondActionId)
        expect(store.alwaysAllowBrowserActions).toBe(true)
        expect(store.actionNeedsAttention).toBe(false)
    })

    it('restores attention without disconnecting when automatic browser approval fails', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message(firstActionRequired)
        await store.allowBrowserActionsForTask()
        source.message({
            type: 'action-resolved',
            actionId: firstActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        source.message(secondActionRequired)

        await vi.waitFor(() => {
            expect(store.error).toBe('Work request failed (500)')
        })
        expect(store.pendingAction?.id).toBe(secondActionId)
        expect(store.alwaysAllowBrowserActions).toBe(false)
        expect(store.actionNeedsAttention).toBe(true)
        expect(store.connectionState).toBe('connected')
    })
})
