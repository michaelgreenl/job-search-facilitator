import type { StartWorkTaskInput, WorkTask, WorkTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkTask } from '../composables/useWorkTask'
import { useWorkStore, type WorkSessionOwner } from '../stores/work'

class MemoryStorage implements Storage {
    readonly values = new Map<string, string>()

    get length() {
        return this.values.size
    }

    clear() {
        this.values.clear()
    }

    getItem(key: string) {
        return this.values.get(key) ?? null
    }

    key(index: number) {
        return [...this.values.keys()][index] ?? null
    }

    removeItem(key: string) {
        this.values.delete(key)
    }

    setItem(key: string, value: string) {
        this.values.set(key, value)
    }
}

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
const importOwner = {
    kind: 'job-post-import',
    url: 'https://example.com/jobs/imported-role',
} satisfies WorkSessionOwner
const outreachOwner = {
    kind: 'outreach-contact',
    postId: '10000000-0000-4000-8000-000000000001',
} satisfies WorkSessionOwner
const workSessionStorageKey = 'job-search-facilitator:work-session'
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
        vi.stubGlobal('sessionStorage', new MemoryStorage())
        vi.stubGlobal('crypto', { randomUUID: () => startedTask.id })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('keeps active import and outreach tasks independently connected and addressable', async () => {
        const cancelledImportTask: WorkTask = { ...startedTask, status: 'cancelled' }
        const importActivity = {
            type: 'activity',
            message: 'Importing job post',
            createdAt: '2026-07-18T12:00:00.000Z',
        } satisfies WorkTaskEvent
        const outreachActivity = {
            type: 'activity',
            message: 'Researching contact',
            createdAt: '2026-07-18T12:00:00.000Z',
        } satisfies WorkTaskEvent
        const randomUUID = vi
            .fn()
            .mockReturnValueOnce(startedTask.id)
            .mockReturnValueOnce(nextTask.id)
        vi.stubGlobal('crypto', { randomUUID })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledImportTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        await store.startTask(taskInput, outreachOwner)

        expect(fetch).toHaveBeenNthCalledWith(2, `http://localhost:3001/tasks/${startedTask.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskInput),
        })
        expect(fetch).toHaveBeenNthCalledWith(4, `http://localhost:3001/tasks/${nextTask.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskInput),
        })
        expect(store.sessions).toEqual([
            { ...importOwner, taskId: startedTask.id },
            { ...outreachOwner, taskId: nextTask.id },
        ])
        expect(store.getSession('job-post-import')).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })
        expect(store.getSession('outreach')).toEqual({
            ...outreachOwner,
            taskId: nextTask.id,
        })
        expect(store.getTaskState(startedTask.id)?.task).toEqual(startedTask)
        expect(store.getTaskState(nextTask.id)?.task).toEqual(nextTask)
        expect(FakeEventSource.instances).toHaveLength(2)
        const importSource = FakeEventSource.instances[0]!
        const outreachSource = FakeEventSource.instances[1]!
        expect(importSource.url).toBe(`http://localhost:3001/tasks/${startedTask.id}/events`)
        expect(outreachSource.url).toBe(`http://localhost:3001/tasks/${nextTask.id}/events`)
        expect(importSource.close).not.toHaveBeenCalled()

        importSource.open()
        outreachSource.open()
        expect(store.getTaskState(startedTask.id)?.connectionState).toBe('connected')
        expect(store.getTaskState(nextTask.id)?.connectionState).toBe('connected')

        importSource.message(importActivity)
        outreachSource.message(outreachActivity)

        expect(store.getTaskState(startedTask.id)?.events).toEqual([importActivity])
        expect(store.getTaskState(nextTask.id)?.events).toEqual([outreachActivity])

        importSource.message(firstActionRequired)
        outreachSource.message(secondActionRequired)
        const outreachStateBeforeImportAction = store.getTaskState(nextTask.id)

        await store.resolveAction(startedTask.id, 'approve')

        expect(fetch).toHaveBeenNthCalledWith(
            5,
            `http://localhost:3001/tasks/${startedTask.id}/actions/${firstActionId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: 'approve' }),
            },
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            pendingAction: { id: firstActionId },
            actionSubmitting: true,
            connectionState: 'connected',
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeImportAction)
        expect(store.getTaskState(nextTask.id)).toMatchObject({
            pendingAction: { id: secondActionId },
            actionSubmitting: false,
            connectionState: 'connected',
        })
        expect(importSource.close).not.toHaveBeenCalled()
        expect(outreachSource.close).not.toHaveBeenCalled()

        await expect(store.cancelTask(startedTask.id)).resolves.toEqual(cancelledImportTask)

        expect(fetch).toHaveBeenNthCalledWith(
            6,
            `http://localhost:3001/tasks/${startedTask.id}/cancel`,
            { method: 'POST' },
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: { status: 'cancelled' },
            events: [importActivity, firstActionRequired],
            connectionState: 'closed',
        })
        expect(store.getTaskState(nextTask.id)).toMatchObject({
            task: nextTask,
            events: [outreachActivity, secondActionRequired],
            pendingAction: { id: secondActionId },
            actionSubmitting: false,
            connectionState: 'connected',
        })
        expect(store.sessions).toHaveLength(2)
        expect(importSource.close).toHaveBeenCalledOnce()
        expect(outreachSource.close).not.toHaveBeenCalled()
    })

    it('keeps a running task active while its event stream reconnects', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)

        expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:3001/health', undefined)
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3001/tasks/${startedTask.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskInput),
            },
        )
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

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            connectionState: 'reconnecting',
            task: { status: 'running' },
        })
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

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            connectionState: 'closed',
            task: {
                status: 'completed',
                output: { title: 'Example Domain' },
            },
        })
        expect(store.getTaskState(startedTask.id)?.events.map(({ type }) => type)).toEqual([
            'activity',
            'completed',
        ])
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('restores both persisted lanes and reconnects each running task', async () => {
        const randomUUID = vi
            .fn()
            .mockReturnValueOnce(startedTask.id)
            .mockReturnValueOnce(nextTask.id)
        vi.stubGlobal('crypto', { randomUUID })
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockResolvedValueOnce(jsonResponse(startedTask))
            .mockResolvedValueOnce(jsonResponse(nextTask))
        const firstStore = useWorkStore()

        await firstStore.startTask(taskInput, importOwner)
        await firstStore.startTask(taskInput, outreachOwner)

        expect(JSON.parse(sessionStorage.getItem(workSessionStorageKey) ?? 'null')).toEqual({
            version: 2,
            sessions: [
                { ...importOwner, taskId: startedTask.id },
                { ...outreachOwner, taskId: nextTask.id },
            ],
        })

        expect(FakeEventSource.instances).toHaveLength(2)
        FakeEventSource.instances = []
        setActivePinia(createPinia())
        const restoredStore = useWorkStore()

        expect(restoredStore.sessions).toEqual([
            { ...importOwner, taskId: startedTask.id },
            { ...outreachOwner, taskId: nextTask.id },
        ])
        expect(restoredStore.getTaskState(startedTask.id)?.task).toBeNull()
        expect(restoredStore.getTaskState(nextTask.id)?.task).toBeNull()

        await restoredStore.restoreSessions()

        expect(fetchMock).toHaveBeenNthCalledWith(
            5,
            `http://localhost:3001/tasks/${startedTask.id}`,
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            6,
            `http://localhost:3001/tasks/${nextTask.id}`,
            undefined,
        )
        expect(restoredStore.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            restoring: false,
            sessionUnavailable: false,
        })
        expect(restoredStore.getTaskState(nextTask.id)).toMatchObject({
            task: nextTask,
            restoring: false,
            sessionUnavailable: false,
        })
        expect(FakeEventSource.instances.map(({ url }) => url)).toEqual([
            `http://localhost:3001/tasks/${startedTask.id}/events`,
            `http://localhost:3001/tasks/${nextTask.id}/events`,
        ])

        FakeEventSource.instances[0]!.open()
        FakeEventSource.instances[1]!.open()

        expect(restoredStore.getTaskState(startedTask.id)?.connectionState).toBe('connected')
        expect(restoredStore.getTaskState(nextTask.id)?.connectionState).toBe('connected')
    })

    it('rejects a mismatched restore response without mutating the other lane', async () => {
        let resolveRestore: ((response: Response) => void) | undefined
        const restoreResponse = new Promise<Response>((resolve) => {
            resolveRestore = resolve
        })
        sessionStorage.setItem(
            workSessionStorageKey,
            JSON.stringify({
                version: 2,
                sessions: [{ ...importOwner, taskId: startedTask.id }],
            }),
        )
        vi.stubGlobal('crypto', { randomUUID: () => nextTask.id })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockReturnValueOnce(restoreResponse)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()
        const importWork = useWorkTask('job-post-import')

        await store.startTask(taskInput, outreachOwner)
        const outreachSource = FakeEventSource.instances[0]!
        outreachSource.open()
        const outreachStateBeforeRestore = store.getTaskState(nextTask.id)
        const restore = store.restoreTask(startedTask.id)

        expect(importWork.taskActive.value).toBe(true)
        expect(importWork.canDismissSession.value).toBe(false)
        expect(store.dismissSession(startedTask.id)).toBe(false)

        resolveRestore?.(jsonResponse({ ...nextTask, status: 'cancelled' }))
        await expect(restore).rejects.toThrow(
            'Work returned a different task than the reserved session',
        )

        expect(fetch).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3001/tasks/${startedTask.id}`,
            undefined,
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            restoring: false,
            sessionUnavailable: false,
            connectionState: 'disconnected',
            error: 'Work returned a different task than the reserved session',
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeRestore)
        expect(store.getTaskState(nextTask.id)?.connectionState).toBe('connected')
        expect(FakeEventSource.instances).toEqual([outreachSource])
        expect(outreachSource.close).not.toHaveBeenCalled()

        expect(importWork.taskActive.value).toBe(false)
        expect(importWork.canDismissSession.value).toBe(true)
        expect(importWork.dismissSession()).toBe(true)
        expect(store.getSession('job-post-import')).toBeNull()

        vi.stubGlobal('crypto', { randomUUID: () => startedTask.id })
        await importWork.startTask(taskInput, importOwner)

        expect(store.getSession('job-post-import')).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeRestore)
        expect(outreachSource.close).not.toHaveBeenCalled()
    })

    it('persists the task owner before the bridge can create its task', async () => {
        let resolveHealth: ((response: Response) => void) | undefined
        const healthResponse = new Promise<Response>((resolve) => {
            resolveHealth = resolve
        })
        vi.mocked(fetch)
            .mockReturnValueOnce(healthResponse)
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        const start = store.startTask(taskInput, importOwner)

        expect(store.getSession('job-post-import')).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            starting: true,
            sessionUnavailable: false,
        })
        expect(JSON.parse(sessionStorage.getItem(workSessionStorageKey) ?? 'null')).toEqual({
            version: 2,
            sessions: [{ ...importOwner, taskId: startedTask.id }],
        })
        expect(store.dismissSession(startedTask.id)).toBe(false)
        expect(store.getSession('job-post-import')).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })

        resolveHealth?.(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
        await start
    })

    it('reads a v1 persisted session and restores it through the multi-session API', async () => {
        sessionStorage.setItem(
            workSessionStorageKey,
            JSON.stringify({
                version: 1,
                session: { ...outreachOwner, taskId: startedTask.id },
            }),
        )
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(startedTask))
        const store = useWorkStore()
        const outreachWork = useWorkTask('outreach')

        expect(store.sessions).toEqual([{ ...outreachOwner, taskId: startedTask.id }])
        expect(store.getSession('outreach')).toEqual({
            ...outreachOwner,
            taskId: startedTask.id,
        })
        expect(outreachWork.taskActive.value).toBe(true)
        expect(outreachWork.canDismissSession.value).toBe(false)

        await store.restoreSessions()

        expect(fetch).toHaveBeenCalledWith(
            `http://localhost:3001/tasks/${startedTask.id}`,
            undefined,
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            connectionState: 'connecting',
            restoring: false,
        })
        expect(FakeEventSource.instances[0]?.url).toBe(
            `http://localhost:3001/tasks/${startedTask.id}/events`,
        )
    })

    it('retains valid v2 sessions when another stored entry is structurally invalid', () => {
        sessionStorage.setItem(
            workSessionStorageKey,
            JSON.stringify({
                version: 2,
                sessions: [
                    { ...importOwner, taskId: startedTask.id },
                    { ...outreachOwner, taskId: nextTask.id, postId: '' },
                ],
            }),
        )

        const store = useWorkStore()

        expect(store.sessions).toEqual([{ ...importOwner, taskId: startedTask.id }])
        expect(store.getTaskState(startedTask.id)).toEqual({
            taskId: startedTask.id,
            task: null,
            events: [],
            connectionState: 'idle',
            pendingAction: null,
            alwaysAllowBrowserActions: false,
            actionSubmitting: false,
            cancelling: false,
            starting: false,
            restoring: false,
            sessionUnavailable: false,
            error: null,
        })
        expect(sessionStorage.getItem(workSessionStorageKey)).not.toBeNull()
    })

    it('rejects a v2 envelope with duplicate valid lanes', () => {
        sessionStorage.setItem(
            workSessionStorageKey,
            JSON.stringify({
                version: 2,
                sessions: [
                    { ...importOwner, taskId: startedTask.id },
                    {
                        kind: 'job-post-import',
                        taskId: nextTask.id,
                        url: 'https://example.com/jobs/another-role',
                    },
                ],
            }),
        )

        const store = useWorkStore()

        expect(store.sessions).toEqual([])
        expect(sessionStorage.getItem(workSessionStorageKey)).toBeNull()
    })

    it('rejects a v2 envelope with duplicate valid task IDs', () => {
        sessionStorage.setItem(
            workSessionStorageKey,
            JSON.stringify({
                version: 2,
                sessions: [
                    { ...importOwner, taskId: startedTask.id },
                    { ...outreachOwner, taskId: startedTask.id },
                ],
            }),
        )

        const store = useWorkStore()

        expect(store.sessions).toEqual([])
        expect(sessionStorage.getItem(workSessionStorageKey)).toBeNull()
    })

    it('keeps a cancelled task session through refresh until it is explicitly dismissed', async () => {
        const cancelledTask: WorkTask = { ...startedTask, status: 'cancelled' }
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask))
        const firstStore = useWorkStore()

        await firstStore.startTask(taskInput, outreachOwner)
        await firstStore.cancelTask(startedTask.id)

        setActivePinia(createPinia())
        const restoredStore = useWorkStore()
        await restoredStore.restoreTask(startedTask.id)

        expect(restoredStore.getTaskState(startedTask.id)?.task?.status).toBe('cancelled')
        expect(restoredStore.getSession('outreach')).toEqual({
            ...outreachOwner,
            taskId: startedTask.id,
        })

        expect(restoredStore.dismissSession(startedTask.id)).toBe(true)

        expect(restoredStore.getSession('outreach')).toBeNull()
        expect(restoredStore.getTaskState(startedTask.id)).toBeNull()
        setActivePinia(createPinia())
        expect(useWorkStore().sessions).toEqual([])
    })

    it('rejects an invalid health response before creating a task or event stream', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'ready', capabilities: ['chrome'] }))
        const store = useWorkStore()

        await expect(store.startTask(taskInput, importOwner)).rejects.toThrow(
            'Work /health returned invalid data',
        )

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            connectionState: 'disconnected',
            sessionUnavailable: true,
            error: 'Work /health returned invalid data',
        })
    })

    it('rejects a contradictory task response before opening its event stream', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(
                jsonResponse({ ...startedTask, status: 'completed', output: null }, 202),
            )
        const store = useWorkStore()

        await expect(store.startTask(taskInput, importOwner)).rejects.toThrow(
            `Work /tasks/${startedTask.id} returned invalid data`,
        )

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            connectionState: 'disconnected',
            error: `Work /tasks/${startedTask.id} returned invalid data`,
        })
    })

    it('keeps running task state when the event stream violates its contract', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        source.open()
        source.rawMessage({
            type: 'completed',
            output: [],
            createdAt: '2026-07-18T12:00:00.000Z',
        })

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            error: 'Work stream returned invalid data',
            connectionState: 'disconnected',
            cancelling: false,
        })
    })

    it('keeps a task cancellable and reconnects it after its event stream closes', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        const replayedActivity = {
            type: 'activity',
            message: 'Reading the job post',
            createdAt: '2026-07-18T12:00:00.000Z',
        } satisfies WorkTaskEvent
        source.message(replayedActivity)
        source.disconnect(FakeEventSource.CLOSED)

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            events: [replayedActivity],
            error: 'Work stream closed before the task finished',
            connectionState: 'disconnected',
        })

        await store.restoreTask(startedTask.id)

        expect(FakeEventSource.instances).toHaveLength(2)
        expect(FakeEventSource.instances[1]?.url).toBe(
            `http://localhost:3001/tasks/${startedTask.id}/events`,
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            connectionState: 'connecting',
            events: [],
            error: null,
        })

        FakeEventSource.instances[1]!.message(replayedActivity)

        expect(store.getTaskState(startedTask.id)?.events).toEqual([replayedActivity])
    })

    it('rejects a mismatched cancel response without mutating the other lane', async () => {
        const randomUUID = vi
            .fn()
            .mockReturnValueOnce(startedTask.id)
            .mockReturnValueOnce(nextTask.id)
        vi.stubGlobal('crypto', { randomUUID })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockResolvedValueOnce(jsonResponse({ ...nextTask, status: 'cancelled' }, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        await store.startTask(taskInput, outreachOwner)
        const importSource = FakeEventSource.instances[0]!
        const outreachSource = FakeEventSource.instances[1]!
        importSource.open()
        outreachSource.open()
        const outreachStateBeforeCancel = store.getTaskState(nextTask.id)

        await expect(store.cancelTask(startedTask.id)).rejects.toThrow(
            'Work returned a different task than the reserved session',
        )

        expect(fetch).toHaveBeenNthCalledWith(
            5,
            `http://localhost:3001/tasks/${startedTask.id}/cancel`,
            { method: 'POST' },
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            cancelling: false,
            sessionUnavailable: false,
            connectionState: 'connected',
            error: 'Work returned a different task than the reserved session',
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeCancel)
        expect(store.getTaskState(nextTask.id)?.connectionState).toBe('connected')
        expect(importSource.close).not.toHaveBeenCalled()
        expect(outreachSource.close).not.toHaveBeenCalled()
    })

    it('cancels a running task and closes its event stream', async () => {
        const cancelledTask: WorkTask = { ...startedTask, status: 'cancelled' }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        source.open()

        await expect(store.cancelTask(startedTask.id)).resolves.toEqual(cancelledTask)

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3001/tasks/${startedTask.id}/cancel`,
            { method: 'POST' },
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: { status: 'cancelled' },
            connectionState: 'closed',
            cancelling: false,
        })
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('keeps a running task available when cancellation fails', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        source.open()

        await expect(store.cancelTask(startedTask.id)).rejects.toThrow('Work request failed (500)')

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            cancelling: false,
            error: 'Work request failed (500)',
            connectionState: 'connected',
        })
        expect(source.close).not.toHaveBeenCalled()
    })

    it('does not create a task when the requested capability is unavailable', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: [] }))
        const store = useWorkStore()

        await expect(store.startTask(taskInput, importOwner)).rejects.toThrow(
            'Work capability is unavailable: chrome',
        )

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            connectionState: 'disconnected',
            sessionUnavailable: true,
            error: 'Work capability is unavailable: chrome',
        })
    })

    it('resumes the same task after a required browser action is approved', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message(firstActionRequired)

        expect(store.getTaskState(startedTask.id)?.pendingAction?.origin).toBe(
            'https://www.linkedin.com',
        )

        await store.resolveAction(startedTask.id, 'approve')

        expect(store.getTaskState(startedTask.id)?.actionSubmitting).toBe(true)
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

        expect(store.getTaskState(startedTask.id)?.actionSubmitting).toBe(false)
        source.message({
            type: 'completed',
            output: { personName: 'Ada Lovelace' },
            createdAt: '2026-07-18T12:00:02.000Z',
        })

        expect(store.getTaskState(startedTask.id)?.pendingAction).toBeNull()
        expect(store.getTaskState(startedTask.id)?.task?.output).toEqual({
            personName: 'Ada Lovelace',
        })
        expect(source.close).toHaveBeenCalledOnce()
    })

    it('asks again after an always-allowed task completes', async () => {
        const randomUUID = vi
            .fn()
            .mockReturnValueOnce(startedTask.id)
            .mockReturnValueOnce(nextTask.id)
        vi.stubGlobal('crypto', { randomUUID })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const firstSource = FakeEventSource.instances[0]!
        firstSource.message(firstActionRequired)

        await store.allowBrowserActionsForTask(startedTask.id)
        firstSource.message({
            type: 'action-resolved',
            actionId: firstActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })
        expect(store.getTaskState(startedTask.id)?.alwaysAllowBrowserActions).toBe(true)

        firstSource.message({
            type: 'completed',
            output: { title: 'First task complete' },
            createdAt: '2026-07-18T12:00:02.000Z',
        })
        expect(store.getTaskState(startedTask.id)?.alwaysAllowBrowserActions).toBe(false)

        await store.startTask(taskInput, importOwner)

        const secondSource = FakeEventSource.instances[1]!
        secondSource.message(secondActionRequired)

        expect(store.getSession('job-post-import')?.taskId).toBe(nextTask.id)
        expect(store.getTaskState(nextTask.id)).toMatchObject({
            pendingAction: { id: secondActionId },
            alwaysAllowBrowserActions: false,
        })
    })

    it('automatically approves later browser actions for the same task', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        source.message(firstActionRequired)
        await store.allowBrowserActionsForTask(startedTask.id)
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
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            pendingAction: { id: secondActionId },
            alwaysAllowBrowserActions: true,
            actionSubmitting: true,
        })
    })

    it('restores attention without disconnecting when automatic browser approval fails', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useWorkStore()

        await store.startTask(taskInput, importOwner)
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message(firstActionRequired)
        await store.allowBrowserActionsForTask(startedTask.id)
        source.message({
            type: 'action-resolved',
            actionId: firstActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        source.message(secondActionRequired)

        await vi.waitFor(() => {
            expect(store.getTaskState(startedTask.id)?.error).toBe('Work request failed (500)')
        })
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            pendingAction: { id: secondActionId },
            alwaysAllowBrowserActions: false,
            actionSubmitting: false,
            connectionState: 'connected',
        })
    })
})
