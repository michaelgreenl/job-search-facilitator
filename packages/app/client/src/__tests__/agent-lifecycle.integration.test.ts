import type { AgentSession, AgentTaskLane } from '@/stores/agent'
import type {
    ContactDiscoveryResult,
    CreateUserAddedJobPostInput,
    UserAddedJobPost,
} from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '@/stores/agent'
import { useJobPostImportStore } from '@/stores/job-post-import'
import { useOutreachStore } from '@/stores/outreach'
import { usePostStore } from '@/stores/post'
import { makeAgentTask } from '@/test/fixtures/agent'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestParts } from '@/test/support/http'
import { MemoryStorage } from '@/test/support/memory-storage'

const agentSessionStorageKey = 'job-search-facilitator:agent-session'
const importTaskId = '11111111-1111-4111-8111-111111111111'
const outreachTaskId = '22222222-2222-4222-8222-222222222222'
const importUrl = 'https://example.com/jobs/imported-role'
const outreachPost = makeJobPost()
const savedContact = makeOutreachContact({ jobPostId: outreachPost.id })
const contactOutput = {
    personName: savedContact.personName,
    personTitle: savedContact.personTitle,
    profileUrl: savedContact.profileUrl,
    relevanceRationale: savedContact.relevanceRationale,
    draftMessage: savedContact.draftMessage,
} satisfies ContactDiscoveryResult
const importOutput = {
    agentLabel: 'target',
    fitRationale: 'Strong TypeScript and Vue fit.',
    applicationFlow: 'Apply through the company careers page.',
    keyLegitimacySignals: 'Listed on the official company careers page.',
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
        postUrl: importUrl,
        applicationUrl: 'https://apply.example.com/jobs/imported-role',
        postStatus: 'active',
    },
} satisfies CreateUserAddedJobPostInput
const savedImportedItem = {
    ...importOutput,
    post: makeJobPost({
        id: '30000000-0000-4000-8000-000000000001',
        ...importOutput.post,
    }),
    addedAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
} satisfies UserAddedJobPost

interface ApiWrites {
    contacts: unknown[]
    imports: unknown[]
}

interface PendingWrite {
    lane: AgentTaskLane
    resolve: (response: Response) => void
    response: Response
}

const readRequestBody = (body: BodyInit | null | undefined) => {
    if (typeof body !== 'string') {
        throw new Error('Expected a JSON request body')
    }

    return JSON.parse(body) as unknown
}

function createApiFallback(writes: ApiWrites, pendingWrites: PendingWrite[] | null) {
    const respond = (lane: AgentTaskLane, response: Response) => {
        if (pendingWrites === null) {
            return response
        }

        return new Promise<Response>((resolve) => pendingWrites.push({ lane, resolve, response }))
    }

    return (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestParts(input, init)

        if (request.method === 'POST' && request.url.endsWith('/api/job-posts')) {
            writes.imports.push(readRequestBody(init?.body))
            return respond('job-post-import', jsonResponse(savedImportedItem, 201))
        }

        if (
            request.method === 'GET' &&
            request.url.endsWith(`/api/job-posts/${outreachPost.id}/outreach-contacts`)
        ) {
            return jsonResponse([])
        }

        if (
            request.method === 'POST' &&
            request.url.endsWith(`/api/job-posts/${outreachPost.id}/outreach-contacts`)
        ) {
            writes.contacts.push(readRequestBody(init?.body))
            return respond('outreach', jsonResponse(savedContact, 201))
        }

        throw new Error(`Unexpected ${request.method} request: ${request.url}`)
    }
}

function readStoredSessions(storage: Storage) {
    const value = storage.getItem(agentSessionStorageKey)
    return value === null ? null : (JSON.parse(value) as unknown)
}

function taskSource(taskId: string) {
    const source = FakeEventSource.instances
        .filter(({ url }) => url.endsWith(`/tasks/${taskId}/events`))
        .at(-1)

    if (source === undefined) {
        throw new Error(`Missing event stream for Agent task "${taskId}"`)
    }

    return source
}

function createLifecycleContext({ deferWrites = false } = {}) {
    const storage = new MemoryStorage()
    const writes: ApiWrites = { contacts: [], imports: [] }
    const pendingWrites: PendingWrite[] = []
    const bridge = new AgentBridgeHarness({
        fallback: createApiFallback(writes, deferWrites ? pendingWrites : null),
    })
    const randomUUID = vi.fn().mockReturnValueOnce(importTaskId).mockReturnValueOnce(outreachTaskId)

    setActivePinia(createPinia())
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('crypto', { randomUUID })
    vi.stubGlobal('fetch', bridge.fetch)

    const agentStore = useAgentStore()
    const importStore = useJobPostImportStore()
    const outreachStore = useOutreachStore()

    return {
        agentStore,
        bridge,
        importStore,
        outreachStore,
        pendingWrites,
        postStore: usePostStore(),
        storage,
        writes,
    }
}

function resolvePendingWrite(
    lane: AgentTaskLane,
    context: ReturnType<typeof createLifecycleContext>,
) {
    const index = context.pendingWrites.findIndex((pendingWrite) => pendingWrite.lane === lane)
    const pendingWrite = context.pendingWrites[index]

    if (pendingWrite === undefined) {
        throw new Error(`Missing pending ${lane} write`)
    }

    context.pendingWrites.splice(index, 1)
    pendingWrite.resolve(pendingWrite.response)
}

async function startBothLanes(context: ReturnType<typeof createLifecycleContext>) {
    context.importStore.url = importUrl
    expect(context.importStore.submitUrl()).toBe(true)
    const outreachStart = context.outreachStore.startContactDiscovery(outreachPost)

    await expect(outreachStart).resolves.toBe(true)
    await vi.waitFor(() => {
        expect(context.agentStore.getTaskState(importTaskId)?.task?.status).toBe('running')
        expect(context.agentStore.getTaskState(outreachTaskId)?.task?.status).toBe('running')
    })

    taskSource(importTaskId).open()
    taskSource(outreachTaskId).open()
}

async function waitForLaneResult(
    lane: AgentTaskLane,
    context: ReturnType<typeof createLifecycleContext>,
) {
    if (lane === 'job-post-import') {
        await vi.waitFor(() => {
            expect(context.writes.imports).toHaveLength(1)
            expect(context.agentStore.getSession(lane)).toBeNull()
        })
        return
    }

    await vi.waitFor(() => {
        expect(context.writes.contacts).toHaveLength(1)
        expect(context.agentStore.getSession(lane)).toBeNull()
    })
}

function completeLane(lane: AgentTaskLane, context: ReturnType<typeof createLifecycleContext>) {
    if (lane === 'job-post-import') {
        context.bridge.complete(importTaskId, importOutput)
    } else {
        context.bridge.complete(outreachTaskId, contactOutput)
    }
}

describe('Agent feature lifecycle integration', () => {
    beforeEach(() => {
        FakeEventSource.reset()
    })

    it.each([
        ['job-post-import', 'outreach'],
        ['outreach', 'job-post-import'],
    ] satisfies Array<[AgentTaskLane, AgentTaskLane]>)(
        'persists %s and %s results once while their lanes complete independently',
        async (firstLane, secondLane) => {
            const context = createLifecycleContext()
            await startBothLanes(context)
            const secondTaskId = secondLane === 'job-post-import' ? importTaskId : outreachTaskId
            const secondSession = context.agentStore.getSession(secondLane)
            const secondSource = taskSource(secondTaskId)

            completeLane(firstLane, context)
            await waitForLaneResult(firstLane, context)

            expect(context.agentStore.isLaneTaskActive(secondLane)).toBe(true)
            expect(context.agentStore.getSession(secondLane)).toEqual(secondSession)
            expect(context.agentStore.getTaskState(secondTaskId)?.task?.status).toBe('running')
            expect(secondSource.close).not.toHaveBeenCalled()
            expect(readStoredSessions(context.storage)).toEqual({
                version: 2,
                sessions: [secondSession],
            })

            completeLane(secondLane, context)
            await waitForLaneResult(secondLane, context)

            expect(context.writes.imports).toEqual([importOutput])
            expect(context.writes.contacts).toEqual([contactOutput])
            expect(context.postStore.userAddedPosts).toEqual([savedImportedItem])
            expect(context.outreachStore.contacts).toEqual([savedContact])
            expect(context.agentStore.sessions).toEqual([])
            expect(readStoredSessions(context.storage)).toBeNull()
            expect(taskSource(importTaskId).close).toHaveBeenCalledOnce()
            expect(taskSource(outreachTaskId).close).toHaveBeenCalledOnce()
        },
    )

    it.each([
        ['job-post-import', 'outreach'],
        ['outreach', 'job-post-import'],
    ] satisfies Array<[AgentTaskLane, AgentTaskLane]>)(
        'keeps concurrent completions isolated when the %s save settles before %s',
        async (firstLane, secondLane) => {
            const context = createLifecycleContext({ deferWrites: true })
            await startBothLanes(context)

            completeLane('job-post-import', context)
            completeLane('outreach', context)

            await vi.waitFor(() => {
                expect(context.pendingWrites.map(({ lane }) => lane).sort()).toEqual([
                    'job-post-import',
                    'outreach',
                ])
            })
            expect(context.agentStore.getSession(firstLane)).not.toBeNull()
            expect(context.agentStore.getSession(secondLane)).not.toBeNull()

            resolvePendingWrite(firstLane, context)
            await vi.waitFor(() => {
                expect(context.agentStore.getSession(firstLane)).toBeNull()
            })
            expect(context.agentStore.getSession(secondLane)).not.toBeNull()

            resolvePendingWrite(secondLane, context)
            await vi.waitFor(() => {
                expect(context.agentStore.sessions).toEqual([])
            })

            expect(context.writes.imports).toEqual([importOutput])
            expect(context.writes.contacts).toEqual([contactOutput])
            expect(context.postStore.userAddedPosts).toEqual([savedImportedItem])
            expect(context.outreachStore.contacts).toEqual([savedContact])
            expect(readStoredSessions(context.storage)).toBeNull()
            expect(taskSource(importTaskId).close).toHaveBeenCalledOnce()
            expect(taskSource(outreachTaskId).close).toHaveBeenCalledOnce()
        },
    )

    it.each([
        { cancelledLane: 'job-post-import', remainingLane: 'outreach' },
        { cancelledLane: 'outreach', remainingLane: 'job-post-import' },
    ] satisfies Array<{
        cancelledLane: AgentTaskLane
        remainingLane: AgentTaskLane
    }>)(
        'does not restore a cancelled $cancelledLane task while $remainingLane stays restorable',
        async ({ cancelledLane, remainingLane }) => {
            const context = createLifecycleContext()
            await startBothLanes(context)
            const cancelledTaskId =
                cancelledLane === 'job-post-import' ? importTaskId : outreachTaskId
            const remainingTaskId =
                remainingLane === 'job-post-import' ? importTaskId : outreachTaskId
            const remainingSession = context.agentStore.getSession(remainingLane)
            const cancelledSource = taskSource(cancelledTaskId)
            const remainingSource = taskSource(remainingTaskId)

            await context.agentStore.cancelTask(cancelledTaskId)

            expect(cancelledSource.close).toHaveBeenCalledOnce()
            expect(remainingSource.close).not.toHaveBeenCalled()
            expect(context.agentStore.getTaskState(cancelledTaskId)?.task?.status).toBe('cancelled')
            expect(context.agentStore.isLaneTaskActive(remainingLane)).toBe(true)
            expect(readStoredSessions(context.storage)).toEqual({
                version: 2,
                sessions: [remainingSession],
            })

            context.bridge.clearRequests()
            FakeEventSource.reset()
            setActivePinia(createPinia())
            const refreshedStore = useAgentStore()

            expect(refreshedStore.sessions).toEqual([remainingSession])
            expect(refreshedStore.getSession(cancelledLane)).toBeNull()
            await refreshedStore.restoreSessions()

            expect(
                context.bridge.requests
                    .filter(
                        ({ method, url }) =>
                            method === 'GET' && new URL(url).pathname.startsWith('/tasks/'),
                    )
                    .map(({ url }) => decodeURIComponent(new URL(url).pathname.split('/').at(-1)!)),
            ).toEqual([remainingTaskId])
            expect(refreshedStore.getTaskState(remainingTaskId)?.task?.status).toBe('running')
            expect(FakeEventSource.instances).toHaveLength(1)
            taskSource(remainingTaskId).open()
            expect(refreshedStore.getTaskState(remainingTaskId)?.connectionState).toBe('connected')

            if (remainingLane === 'job-post-import') {
                const refreshedImportStore = useJobPostImportStore()
                const refreshedPostStore = usePostStore()

                context.bridge.complete(remainingTaskId, importOutput)

                await vi.waitFor(() => {
                    expect(context.writes.imports).toHaveLength(1)
                    expect(refreshedStore.getSession(remainingLane)).toBeNull()
                })
                expect(context.writes.imports).toEqual([importOutput])
                expect(context.writes.contacts).toEqual([])
                expect(refreshedImportStore.importedItem).toEqual(savedImportedItem)
                expect(refreshedPostStore.userAddedPosts).toEqual([savedImportedItem])
            } else {
                const refreshedOutreachStore = useOutreachStore()

                await expect(refreshedOutreachStore.restoreTaskContext()).resolves.toBe(true)
                context.bridge.complete(remainingTaskId, contactOutput)

                await vi.waitFor(() => {
                    expect(context.writes.contacts).toHaveLength(1)
                    expect(refreshedStore.getSession(remainingLane)).toBeNull()
                })
                expect(context.writes.contacts).toEqual([contactOutput])
                expect(context.writes.imports).toEqual([])
                expect(refreshedOutreachStore.contacts).toEqual([savedContact])
            }

            expect(readStoredSessions(context.storage)).toBeNull()
            expect(taskSource(remainingTaskId).close).toHaveBeenCalledOnce()
        },
    )

    it.each([
        { failedLane: 'job-post-import', restoredLane: 'outreach' },
        { failedLane: 'outreach', restoredLane: 'job-post-import' },
    ] satisfies Array<{
        failedLane: AgentTaskLane
        restoredLane: AgentTaskLane
    }>)(
        'restores $restoredLane when the persisted $failedLane task cannot be restored',
        async ({ failedLane, restoredLane }) => {
            const storage = new MemoryStorage()
            const importTask = makeAgentTask({ id: importTaskId })
            const outreachTask = makeAgentTask({ id: outreachTaskId })
            const importSession = {
                kind: 'job-post-import',
                taskId: importTaskId,
                url: importUrl,
            } satisfies AgentSession
            const outreachSession = {
                kind: 'outreach-contact',
                taskId: outreachTaskId,
                postId: outreachPost.id,
            } satisfies AgentSession
            const sessions = [importSession, outreachSession]
            const failedTaskId = failedLane === 'job-post-import' ? importTaskId : outreachTaskId
            const restoredTaskId =
                restoredLane === 'job-post-import' ? importTaskId : outreachTaskId
            const bridge = new AgentBridgeHarness()
            bridge.seedTask(importTask)
            bridge.seedTask(outreachTask)
            bridge.failRestore(failedTaskId, 'Agent restore unavailable')
            storage.setItem(agentSessionStorageKey, JSON.stringify({ version: 2, sessions }))
            setActivePinia(createPinia())
            vi.stubGlobal('sessionStorage', storage)
            vi.stubGlobal('EventSource', FakeEventSource)
            vi.stubGlobal('fetch', bridge.fetch)
            const agentStore = useAgentStore()

            await expect(agentStore.restoreSessions()).resolves.toBeUndefined()

            expect(agentStore.getTaskState(failedTaskId)).toMatchObject({
                task: null,
                restoring: false,
                connectionState: 'disconnected',
                error: 'Agent restore unavailable',
            })
            expect(agentStore.getTaskState(restoredTaskId)?.task?.status).toBe('running')
            expect(agentStore.isLaneTaskActive(failedLane)).toBe(false)
            expect(agentStore.isLaneTaskActive(restoredLane)).toBe(true)
            expect(FakeEventSource.forTask(failedTaskId)).toBeUndefined()
            const restoredSource = taskSource(restoredTaskId)
            restoredSource.open()
            expect(agentStore.getTaskState(restoredTaskId)?.connectionState).toBe('connected')
            expect(readStoredSessions(storage)).toEqual({ version: 2, sessions })

            const importStore = useJobPostImportStore()
            const outreachStore = useOutreachStore()

            if (failedLane === 'job-post-import') {
                expect(importStore.displayIssue).toBe('Agent restore unavailable')
                expect(outreachStore.taskActive).toBe(true)
            } else {
                expect(outreachStore.taskIssue).toBe('Agent restore unavailable')
                expect(importStore.running).toBe(true)
            }
        },
    )
})
