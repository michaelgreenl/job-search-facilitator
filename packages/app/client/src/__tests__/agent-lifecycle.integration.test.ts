import type { AgentSession } from '@/stores/agent'
import type {
    ContactDiscoveryResult,
    CreateUserAddedJobPostInput,
    UserAddedJobPost,
} from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '@/stores/agent'
import { useJobPostImportStore } from '@/stores/job-post-import'
import { usePostStore } from '@/stores/post'
import { useOutreachStore } from '@/stores/outreach'
import { makeAgentTask } from '@/test/fixtures/agent'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestParts } from '@/test/support/http'
import { MemoryStorage } from '@/test/support/memory-storage'

type AgentTaskLane = 'job-post-import' | 'outreach'

const agentSessionStorageKey = 'job-search-facilitator:agent-session'
const importTaskId = '11111111-1111-4111-8111-111111111111'
const outreachTaskId = '22222222-2222-4222-8222-222222222222'
const secondOutreachTaskId = '33333333-3333-4333-8333-333333333333'
const importUrl = 'https://example.com/jobs/imported-role'
const outreachPost = makeJobPost()
const savedContact = makeOutreachContact({ jobPostId: outreachPost.id })
const contactOutput = {
    outcome: 'contact',
    contact: {
        personName: savedContact.personName,
        personTitle: savedContact.personTitle,
        profileUrl: savedContact.profileUrl,
        relevanceRationale: savedContact.relevanceRationale,
        draftMessage: savedContact.draftMessage,
    },
    error: null,
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
        description: 'Complete imported job description',
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
    jobPostSnapshot: {
        description: importOutput.post.description,
        sourceUrl: importOutput.post.postUrl,
        capturedAt: '2026-07-20T12:00:00.000Z',
    },
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
    const randomUUID = vi
        .fn()
        .mockReturnValueOnce(importTaskId)
        .mockReturnValueOnce(outreachTaskId)
        .mockReturnValueOnce(secondOutreachTaskId)

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
    context.outreachStore.openForPost(outreachPost.id)
    const outreachStart = context.outreachStore.startContactDiscovery(outreachPost)

    await expect(outreachStart).resolves.toBe(true)
    await vi.waitFor(() => {
        expect(context.agentStore.getTaskState(importTaskId)?.task?.status).toBe('running')
        expect(context.agentStore.getTaskState(outreachTaskId)?.task?.status).toBe('running')
    })

    taskSource(importTaskId).open()
    taskSource(outreachTaskId).open()
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
            const firstTaskId = firstLane === 'job-post-import' ? importTaskId : outreachTaskId
            const secondTaskId = secondLane === 'job-post-import' ? importTaskId : outreachTaskId

            expect(context.agentStore.getSession(firstTaskId)).not.toBeNull()
            expect(context.agentStore.getSession(secondTaskId)).not.toBeNull()

            resolvePendingWrite(firstLane, context)
            await vi.waitFor(() => {
                expect(context.agentStore.getSession(firstTaskId)).toBeNull()
            })
            expect(context.agentStore.getSession(secondTaskId)).not.toBeNull()

            resolvePendingWrite(secondLane, context)
            await vi.waitFor(() => {
                expect(context.agentStore.sessions).toEqual([])
            })

            expect(context.writes.imports).toEqual([importOutput])
            expect(context.writes.contacts).toEqual([contactOutput.contact])
            expect(context.postStore.userAddedPosts).toEqual([savedImportedItem])
            expect(context.outreachStore.contacts).toEqual([savedContact])
            expect(readStoredSessions(context.storage)).toBeNull()
            expect(taskSource(importTaskId).close).toHaveBeenCalledOnce()
            expect(taskSource(outreachTaskId).close).toHaveBeenCalledOnce()
        },
    )

    it('restores every active outreach run, persists an exact completion, and skips cancellation', async () => {
        const context = createLifecycleContext()
        await startBothLanes(context)
        await expect(context.outreachStore.startContactDiscovery(outreachPost)).resolves.toBe(true)
        await vi.waitFor(() => {
            expect(context.agentStore.getTaskState(secondOutreachTaskId)?.task?.status).toBe(
                'running',
            )
        })
        taskSource(secondOutreachTaskId).open()

        await context.agentStore.cancelTask(importTaskId)

        const firstOutreachSession = context.agentStore.getSession(outreachTaskId)
        const secondOutreachSession = context.agentStore.getSession(secondOutreachTaskId)
        expect(readStoredSessions(context.storage)).toEqual({
            version: 2,
            sessions: [firstOutreachSession, secondOutreachSession],
        })

        context.bridge.clearRequests()
        FakeEventSource.reset()
        setActivePinia(createPinia())
        const refreshedAgentStore = useAgentStore()

        await refreshedAgentStore.restoreSessions()

        expect(refreshedAgentStore.getSession(importTaskId)).toBeNull()
        expect(refreshedAgentStore.isTaskActive(outreachTaskId)).toBe(true)
        expect(refreshedAgentStore.isTaskActive(secondOutreachTaskId)).toBe(true)
        expect(FakeEventSource.instances).toHaveLength(2)
        taskSource(outreachTaskId).open()
        taskSource(secondOutreachTaskId).open()

        const refreshedOutreachStore = useOutreachStore()
        await expect(refreshedOutreachStore.restoreTaskContext(outreachTaskId)).resolves.toBe(true)
        context.bridge.complete(outreachTaskId, contactOutput)

        await vi.waitFor(() => {
            expect(context.writes.contacts).toEqual([contactOutput.contact])
            expect(refreshedAgentStore.getSession(outreachTaskId)).toBeNull()
        })
        expect(refreshedAgentStore.getSession(secondOutreachTaskId)).toEqual(secondOutreachSession)
        expect(refreshedAgentStore.isTaskActive(secondOutreachTaskId)).toBe(true)
        expect(taskSource(secondOutreachTaskId).close).not.toHaveBeenCalled()
        expect(refreshedOutreachStore.contacts).toEqual([savedContact])
        expect(readStoredSessions(context.storage)).toEqual({
            version: 2,
            sessions: [secondOutreachSession],
        })
    })

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
            expect(agentStore.isTaskActive(failedTaskId)).toBe(false)
            expect(agentStore.isTaskActive(restoredTaskId)).toBe(true)
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
