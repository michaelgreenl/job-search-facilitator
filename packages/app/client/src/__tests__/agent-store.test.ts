import type { StartAgentTaskInput, AgentTask, AgentTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore, type AgentSessionOwner } from '../stores/agent'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse } from '@/test/support/http'
import { MemoryStorage } from '@/test/support/memory-storage'

const startedTask: AgentTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const nextTask: AgentTask = {
    ...startedTask,
    id: 'a8314bdd-2a1c-48f3-8982-a57fd8b04f5c',
    threadId: 'next-thread-id',
    turnId: 'next-turn-id',
}
const thirdTaskId = '90766a9a-1096-40a7-89bb-a0e4c3eacfed'
const thirdTask: AgentTask = {
    ...startedTask,
    id: thirdTaskId,
    threadId: 'third-thread-id',
    turnId: 'third-turn-id',
}

const taskInput = {
    prompt: 'Read Example Domain',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
} satisfies StartAgentTaskInput
const importOwner = {
    kind: 'job-post-import',
    url: 'https://example.com/jobs/imported-role',
} satisfies AgentSessionOwner
const outreachOwner = {
    kind: 'outreach-contact',
    postId: '10000000-0000-4000-8000-000000000001',
} satisfies AgentSessionOwner
const agentSessionStorageKey = 'job-search-facilitator:agent-session'
const firstPermissionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'
const firstPermissionRequired = {
    type: 'permission-required',
    permission: {
        id: firstPermissionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://www.linkedin.com?',
        origin: 'https://www.linkedin.com',
    },
    createdAt: '2026-07-18T12:00:00.000Z',
} satisfies AgentTaskEvent
const secondPermissionId = 'b110f66c-b31c-4db5-90ad-89ac670d6ce0'
const secondPermissionRequired = {
    type: 'permission-required',
    permission: {
        id: secondPermissionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://example.com?',
        origin: 'https://example.com',
    },
    createdAt: '2026-07-18T12:00:02.000Z',
} satisfies AgentTaskEvent

describe('agent store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        vi.stubGlobal('fetch', vi.fn())
        vi.stubGlobal('sessionStorage', new MemoryStorage())
        vi.stubGlobal('crypto', { randomUUID: () => startedTask.id })
    })

    it('keeps active import and outreach tasks independently connected and addressable', async () => {
        const cancelledImportTask: AgentTask = { ...startedTask, status: 'cancelled' }
        const importActivity = {
            type: 'activity',
            message: 'Importing job post',
            createdAt: '2026-07-18T12:00:00.000Z',
        } satisfies AgentTaskEvent
        const outreachActivity = {
            type: 'activity',
            message: 'Researching contact',
            createdAt: '2026-07-18T12:00:00.000Z',
        } satisfies AgentTaskEvent
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
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        await store.startTask(taskInput, outreachOwner).started

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
        expect(store.getSession(startedTask.id)).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })
        expect(store.getSession(nextTask.id)).toEqual({
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

        importSource.message(firstPermissionRequired)
        outreachSource.message(secondPermissionRequired)
        const outreachStateBeforeImportAction = store.getTaskState(nextTask.id)

        await store.resolvePermission(startedTask.id, 'approve')

        expect(fetch).toHaveBeenNthCalledWith(
            5,
            `http://localhost:3001/tasks/${startedTask.id}/permissions/${firstPermissionId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: 'approve' }),
            },
        )
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            pendingPermission: { id: firstPermissionId },
            permissionSubmitting: true,
            connectionState: 'connected',
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeImportAction)
        expect(store.getTaskState(nextTask.id)).toMatchObject({
            pendingPermission: { id: secondPermissionId },
            permissionSubmitting: false,
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
            events: [importActivity, firstPermissionRequired],
            connectionState: 'closed',
        })
        expect(store.getTaskState(nextTask.id)).toMatchObject({
            task: nextTask,
            events: [outreachActivity, secondPermissionRequired],
            pendingPermission: { id: secondPermissionId },
            permissionSubmitting: false,
            connectionState: 'connected',
        })
        expect(store.sessions).toHaveLength(2)
        expect(importSource.close).toHaveBeenCalledOnce()
        expect(outreachSource.close).not.toHaveBeenCalled()
    })

    it('starts and isolates multiple outreach tasks for the same post', async () => {
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
        const store = useAgentStore()

        const firstStart = store.startTask(taskInput, outreachOwner)
        await firstStart.started
        const samePostStart = store.startTask(taskInput, outreachOwner)
        await samePostStart.started

        expect(store.sessions).toEqual([
            { ...outreachOwner, taskId: firstStart.taskId },
            { ...outreachOwner, taskId: samePostStart.taskId },
        ])
        expect(store.getTaskState(firstStart.taskId)?.task).toEqual(startedTask)
        expect(store.getTaskState(samePostStart.taskId)?.task).toEqual(nextTask)
    })

    it('rejects a second import while the first start is pending', async () => {
        let resolveHealth: ((response: Response) => void) | undefined
        const healthResponse = new Promise<Response>((resolve) => {
            resolveHealth = resolve
        })
        const fetchMock = vi
            .mocked(fetch)
            .mockReturnValueOnce(healthResponse)
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useAgentStore()

        const firstStart = store.startTask(taskInput, importOwner)

        expect(() => store.startTask(taskInput, importOwner)).toThrow(
            'Another job-post-import Agent task is already active',
        )
        expect(fetchMock).toHaveBeenCalledOnce()

        resolveHealth?.(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
        await expect(firstStart.started).resolves.toEqual(startedTask)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('keeps a running task active while its event stream reconnects', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started

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

    it('restores persisted import and multiple outreach tasks', async () => {
        const randomUUID = vi
            .fn()
            .mockReturnValueOnce(startedTask.id)
            .mockReturnValueOnce(nextTask.id)
            .mockReturnValueOnce(thirdTask.id)
        vi.stubGlobal('crypto', { randomUUID })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(thirdTask, 202))
            .mockResolvedValueOnce(jsonResponse(startedTask))
            .mockResolvedValueOnce(jsonResponse(nextTask))
            .mockResolvedValueOnce(jsonResponse(thirdTask))
        const firstStore = useAgentStore()

        await firstStore.startTask(taskInput, importOwner).started
        await firstStore.startTask(taskInput, outreachOwner).started
        await firstStore.startTask(taskInput, outreachOwner).started

        expect(JSON.parse(sessionStorage.getItem(agentSessionStorageKey) ?? 'null')).toEqual({
            version: 2,
            sessions: [
                { ...importOwner, taskId: startedTask.id },
                { ...outreachOwner, taskId: nextTask.id },
                { ...outreachOwner, taskId: thirdTask.id },
            ],
        })

        expect(FakeEventSource.instances).toHaveLength(3)
        FakeEventSource.reset()
        setActivePinia(createPinia())
        const restoredStore = useAgentStore()

        expect(restoredStore.sessions).toEqual([
            { ...importOwner, taskId: startedTask.id },
            { ...outreachOwner, taskId: nextTask.id },
            { ...outreachOwner, taskId: thirdTask.id },
        ])
        const taskIds = restoredStore.sessions.map(({ taskId }) => taskId)
        expect(taskIds.map((taskId) => restoredStore.getTaskState(taskId)?.task)).toEqual([
            null,
            null,
            null,
        ])

        await restoredStore.restoreSessions()

        expect(taskIds.map((taskId) => restoredStore.getTaskState(taskId)?.task)).toEqual([
            startedTask,
            nextTask,
            thirdTask,
        ])
        expect(FakeEventSource.instances.map(({ url }) => url)).toEqual([
            `http://localhost:3001/tasks/${startedTask.id}/events`,
            `http://localhost:3001/tasks/${nextTask.id}/events`,
            `http://localhost:3001/tasks/${thirdTask.id}/events`,
        ])

        FakeEventSource.instances.forEach((source) => source.open())

        expect(
            taskIds.map((taskId) => restoredStore.getTaskState(taskId)?.connectionState),
        ).toEqual(['connected', 'connected', 'connected'])
    })

    it('rejects a mismatched restore response without mutating the other lane', async () => {
        let resolveRestore: ((response: Response) => void) | undefined
        const restoreResponse = new Promise<Response>((resolve) => {
            resolveRestore = resolve
        })
        sessionStorage.setItem(
            agentSessionStorageKey,
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
        const store = useAgentStore()

        await store.startTask(taskInput, outreachOwner).started
        const outreachSource = FakeEventSource.instances[0]!
        outreachSource.open()
        const outreachStateBeforeRestore = store.getTaskState(nextTask.id)
        const restore = store.restoreTask(startedTask.id)

        expect(store.isTaskActive(startedTask.id)).toBe(true)
        expect(store.dismissSession(startedTask.id)).toBe(false)

        resolveRestore?.(jsonResponse({ ...nextTask, status: 'cancelled' }))
        await expect(restore).rejects.toThrow(
            'Agent returned a different task than the reserved session',
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
            error: 'Agent returned a different task than the reserved session',
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeRestore)
        expect(store.getTaskState(nextTask.id)?.connectionState).toBe('connected')
        expect(FakeEventSource.instances).toEqual([outreachSource])
        expect(outreachSource.close).not.toHaveBeenCalled()

        expect(store.isTaskActive(startedTask.id)).toBe(false)
        expect(store.dismissSession(startedTask.id)).toBe(true)
        expect(store.getSession(startedTask.id)).toBeNull()

        vi.stubGlobal('crypto', { randomUUID: () => startedTask.id })
        await store.startTask(taskInput, importOwner).started

        expect(store.getSession(startedTask.id)).toEqual({
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
        const store = useAgentStore()

        const start = store.startTask(taskInput, importOwner)

        expect(store.getSession(startedTask.id)).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            starting: true,
            sessionUnavailable: false,
        })
        expect(JSON.parse(sessionStorage.getItem(agentSessionStorageKey) ?? 'null')).toEqual({
            version: 2,
            sessions: [{ ...importOwner, taskId: startedTask.id }],
        })
        expect(store.dismissSession(startedTask.id)).toBe(false)
        expect(store.getSession(startedTask.id)).toEqual({
            ...importOwner,
            taskId: startedTask.id,
        })

        resolveHealth?.(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
        await start.started
    })

    it('reads a v1 persisted session and restores it through the multi-session API', async () => {
        sessionStorage.setItem(
            agentSessionStorageKey,
            JSON.stringify({
                version: 1,
                session: { ...outreachOwner, taskId: startedTask.id },
            }),
        )
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(startedTask))
        const store = useAgentStore()

        expect(store.sessions).toEqual([{ ...outreachOwner, taskId: startedTask.id }])
        expect(store.getSession(startedTask.id)).toEqual({
            ...outreachOwner,
            taskId: startedTask.id,
        })
        expect(store.isTaskActive(startedTask.id)).toBe(true)

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
            agentSessionStorageKey,
            JSON.stringify({
                version: 2,
                sessions: [
                    { ...importOwner, taskId: startedTask.id },
                    { ...outreachOwner, taskId: nextTask.id, postId: '' },
                ],
            }),
        )

        const store = useAgentStore()

        expect(store.sessions).toEqual([{ ...importOwner, taskId: startedTask.id }])
        expect(store.getTaskState(startedTask.id)).toEqual({
            taskId: startedTask.id,
            task: null,
            events: [],
            connectionState: 'idle',
            pendingPermission: null,
            alwaysAllowBrowserActions: false,
            permissionSubmitting: false,
            cancelling: false,
            starting: false,
            restoring: false,
            sessionUnavailable: false,
            error: null,
        })
        expect(sessionStorage.getItem(agentSessionStorageKey)).not.toBeNull()
    })

    it('rejects a v2 envelope with more than one job-post-import', () => {
        const sessions = [
            { ...importOwner, taskId: startedTask.id },
            {
                kind: 'job-post-import',
                taskId: nextTask.id,
                url: 'https://example.com/jobs/another-role',
            },
        ]
        sessionStorage.setItem(agentSessionStorageKey, JSON.stringify({ version: 2, sessions }))

        const store = useAgentStore()

        expect(store.sessions).toEqual([])
        expect(sessionStorage.getItem(agentSessionStorageKey)).toBeNull()
    })

    it('rejects a v2 envelope with duplicate valid task IDs', () => {
        sessionStorage.setItem(
            agentSessionStorageKey,
            JSON.stringify({
                version: 2,
                sessions: [
                    { ...importOwner, taskId: startedTask.id },
                    { ...outreachOwner, taskId: startedTask.id },
                ],
            }),
        )

        const store = useAgentStore()

        expect(store.sessions).toEqual([])
        expect(sessionStorage.getItem(agentSessionStorageKey)).toBeNull()
    })

    it('does not restore a cancelled task while restoring its active sibling', async () => {
        const cancelledTask: AgentTask = { ...startedTask, status: 'cancelled' }
        vi.stubGlobal('crypto', {
            randomUUID: vi
                .fn()
                .mockReturnValueOnce(startedTask.id)
                .mockReturnValueOnce(nextTask.id),
        })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask, 202))
            .mockResolvedValueOnce(jsonResponse(nextTask))
        const firstStore = useAgentStore()

        await firstStore.startTask(taskInput, outreachOwner).started
        await firstStore.startTask(taskInput, outreachOwner).started
        await firstStore.cancelTask(startedTask.id)

        expect(firstStore.getTaskState(startedTask.id)?.task?.status).toBe('cancelled')
        expect(firstStore.getSession(startedTask.id)).not.toBeNull()
        expect(JSON.parse(sessionStorage.getItem(agentSessionStorageKey) ?? 'null')).toEqual({
            version: 2,
            sessions: [{ ...outreachOwner, taskId: nextTask.id }],
        })

        setActivePinia(createPinia())
        FakeEventSource.reset()
        const refreshedStore = useAgentStore()

        expect(refreshedStore.getTaskState(startedTask.id)).toBeNull()
        await refreshedStore.restoreSessions()
        expect(refreshedStore.getTaskState(nextTask.id)?.task).toEqual(nextTask)
        expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('rejects an invalid health response before creating a task or event stream', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'ready', capabilities: ['chrome'] }))
        const store = useAgentStore()

        await expect(store.startTask(taskInput, importOwner).started).rejects.toThrow(
            'Agent /health returned invalid data',
        )

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            connectionState: 'disconnected',
            sessionUnavailable: true,
            error: 'Agent /health returned invalid data',
        })
    })

    it('retries the requested terminal task without replacing its active sibling', async () => {
        vi.stubGlobal('crypto', {
            randomUUID: vi
                .fn()
                .mockReturnValueOnce(startedTask.id)
                .mockReturnValueOnce(nextTask.id)
                .mockReturnValueOnce(thirdTask.id),
        })
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(nextTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(thirdTask, 202))
        const store = useAgentStore()

        const sibling = store.startTask(taskInput, outreachOwner)
        await sibling.started
        const target = store.startTask(taskInput, outreachOwner)
        await target.started
        FakeEventSource.instances[1]!.message({
            type: 'failed',
            error: 'Contact discovery failed',
            createdAt: '2026-07-18T12:00:00.000Z',
        })

        const retry = store.retryTask(target.taskId, taskInput)

        expect(retry.taskId).toBe(thirdTask.id)
        expect(store.getSession(target.taskId)).toBeNull()
        expect(store.getSession(sibling.taskId)).not.toBeNull()
        expect(store.getSession(retry.taskId)).toEqual({
            ...outreachOwner,
            taskId: thirdTask.id,
        })
        await expect(retry.started).resolves.toEqual(thirdTask)
    })

    it('rejects a contradictory task response before opening its event stream', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(
                jsonResponse({ ...startedTask, status: 'completed', output: null }, 202),
            )
        const store = useAgentStore()

        await expect(store.startTask(taskInput, importOwner).started).rejects.toThrow(
            `Agent /tasks/${startedTask.id} returned invalid data`,
        )

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: null,
            connectionState: 'disconnected',
            error: `Agent /tasks/${startedTask.id} returned invalid data`,
        })
    })

    it('keeps running task state when the event stream violates its contract', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message({
            type: 'completed',
            output: [],
            createdAt: '2026-07-18T12:00:00.000Z',
        })

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            error: 'Agent stream returned invalid data',
            connectionState: 'disconnected',
            cancelling: false,
        })
    })

    it('keeps a task cancellable and reconnects it after its event stream closes', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const source = FakeEventSource.instances[0]!
        const replayedActivity = {
            type: 'activity',
            message: 'Reading the job post',
            createdAt: '2026-07-18T12:00:00.000Z',
        } satisfies AgentTaskEvent
        source.message(replayedActivity)
        source.disconnect(FakeEventSource.CLOSED)

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            events: [replayedActivity],
            error: 'Agent stream closed before the task finished',
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
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        await store.startTask(taskInput, outreachOwner).started
        const importSource = FakeEventSource.instances[0]!
        const outreachSource = FakeEventSource.instances[1]!
        importSource.open()
        outreachSource.open()
        const outreachStateBeforeCancel = store.getTaskState(nextTask.id)

        await expect(store.cancelTask(startedTask.id)).rejects.toThrow(
            'Agent returned a different task than the reserved session',
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
            error: 'Agent returned a different task than the reserved session',
        })
        expect(store.getTaskState(nextTask.id)).toEqual(outreachStateBeforeCancel)
        expect(store.getTaskState(nextTask.id)?.connectionState).toBe('connected')
        expect(importSource.close).not.toHaveBeenCalled()
        expect(outreachSource.close).not.toHaveBeenCalled()
    })

    it('cancels a running task and closes its event stream', async () => {
        const cancelledTask: AgentTask = { ...startedTask, status: 'cancelled' }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask, 202))
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
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
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const source = FakeEventSource.instances[0]!
        source.open()

        await expect(store.cancelTask(startedTask.id)).rejects.toThrow('Agent request failed (500)')

        expect(store.getTaskState(startedTask.id)).toMatchObject({
            task: startedTask,
            cancelling: false,
            error: 'Agent request failed (500)',
            connectionState: 'connected',
        })
        expect(source.close).not.toHaveBeenCalled()
    })

    it('does not create a task when the requested capability is unavailable', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: [] }))
        const store = useAgentStore()

        await expect(store.startTask(taskInput, importOwner).started).rejects.toThrow(
            'Agent capability is unavailable: chrome',
        )

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            connectionState: 'disconnected',
            sessionUnavailable: true,
            error: 'Agent capability is unavailable: chrome',
        })
    })

    it('resumes the same task after a required browser permission is approved', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message(firstPermissionRequired)

        expect(store.getTaskState(startedTask.id)?.pendingPermission?.origin).toBe(
            'https://www.linkedin.com',
        )

        await store.resolvePermission(startedTask.id, 'approve')

        expect(store.getTaskState(startedTask.id)?.permissionSubmitting).toBe(true)
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3001/tasks/${startedTask.id}/permissions/${firstPermissionId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision: 'approve' }),
            },
        )
        expect(FakeEventSource.instances).toHaveLength(1)
        expect(source.close).not.toHaveBeenCalled()

        source.message({
            type: 'permission-resolved',
            permissionId: firstPermissionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        expect(store.getTaskState(startedTask.id)?.permissionSubmitting).toBe(false)
        source.message({
            type: 'completed',
            output: { personName: 'Ada Lovelace' },
            createdAt: '2026-07-18T12:00:02.000Z',
        })

        expect(store.getTaskState(startedTask.id)?.pendingPermission).toBeNull()
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
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const firstSource = FakeEventSource.instances[0]!
        firstSource.message(firstPermissionRequired)

        await store.allowBrowserActionsForTask(startedTask.id)
        firstSource.message({
            type: 'permission-resolved',
            permissionId: firstPermissionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })
        expect(store.getTaskState(startedTask.id)?.alwaysAllowBrowserActions).toBe(true)

        firstSource.message({
            type: 'completed',
            output: { title: 'First task complete' },
            createdAt: '2026-07-18T12:00:02.000Z',
        })
        expect(store.getTaskState(startedTask.id)?.alwaysAllowBrowserActions).toBe(false)

        await store.startTask(taskInput, importOwner).started

        const secondSource = FakeEventSource.instances[1]!
        secondSource.message(secondPermissionRequired)

        expect(store.getSession(nextTask.id)?.kind).toBe('job-post-import')
        expect(store.getTaskState(nextTask.id)).toMatchObject({
            pendingPermission: { id: secondPermissionId },
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
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const source = FakeEventSource.instances[0]!
        source.message(firstPermissionRequired)
        await store.allowBrowserActionsForTask(startedTask.id)
        source.message({
            type: 'permission-resolved',
            permissionId: firstPermissionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        source.message(secondPermissionRequired)

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                4,
                `http://localhost:3001/tasks/${startedTask.id}/permissions/${secondPermissionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'approve' }),
                },
            )
        })
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            pendingPermission: { id: secondPermissionId },
            alwaysAllowBrowserActions: true,
            permissionSubmitting: true,
        })
    })

    it('restores attention without disconnecting when automatic browser approval fails', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(startedTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useAgentStore()

        await store.startTask(taskInput, importOwner).started
        const source = FakeEventSource.instances[0]!
        source.open()
        source.message(firstPermissionRequired)
        await store.allowBrowserActionsForTask(startedTask.id)
        source.message({
            type: 'permission-resolved',
            permissionId: firstPermissionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        source.message(secondPermissionRequired)

        await vi.waitFor(() => {
            expect(store.getTaskState(startedTask.id)?.error).toBe('Agent request failed (500)')
        })
        expect(store.getTaskState(startedTask.id)).toMatchObject({
            pendingPermission: { id: secondPermissionId },
            alwaysAllowBrowserActions: false,
            permissionSubmitting: false,
            connectionState: 'connected',
        })
    })
})
