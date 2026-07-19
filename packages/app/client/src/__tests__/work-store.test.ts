/** @vitest-environment jsdom */

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

const taskInput = {
    prompt: 'Read Example Domain',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
} satisfies StartWorkTaskInput

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
        expect(store.events).toHaveLength(2)
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('stops retrying when the event stream closes permanently', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput)
        const source = FakeEventSource.instances[0]!
        source.disconnect(FakeEventSource.CLOSED)

        expect(store.connectionState).toBe('disconnected')
        expect(store.task?.status).toBe('running')
        expect(store.error).toBe('Work stream closed before the task finished')
        expect(source.close).toHaveBeenCalledOnce()
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
        source.message({
            type: 'action-required',
            action: {
                id: 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4',
                kind: 'browser-origin',
                message: 'Allow Chrome to access https://www.linkedin.com?',
                origin: 'https://www.linkedin.com',
            },
            createdAt: '2026-07-18T12:00:00.000Z',
        })

        expect(store.pendingAction?.origin).toBe('https://www.linkedin.com')

        await store.resolveAction('approve')

        expect(store.actionSubmitting).toBe(true)
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3001/tasks/${startedTask.id}/actions/b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4`,
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
            actionId: 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4',
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
})
