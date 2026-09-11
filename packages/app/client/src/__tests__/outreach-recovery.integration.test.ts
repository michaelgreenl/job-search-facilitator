import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAgentStore } from '@/stores/agent'
import { useOutreachStore } from '@/stores/outreach'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { MemoryStorage } from '@/test/support/memory-storage'

const post = makeJobPost()
const contact = makeOutreachContact({ jobPostId: post.id })

beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.stubGlobal('EventSource', FakeEventSource)
})

function openDraft() {
    const store = useOutreachStore()
    store.openForPost(post.id, null)
    store.setContactsForPost(post.id, [contact])
    store.selectContact(contact)
    return store
}

it.each(['failed', 'invalid-result'] as const)(
    'clears %s errors on retry, a new request, and refresh without clearing another task',
    async (failure) => {
        const bridge = new AgentBridgeHarness()
        vi.stubGlobal('fetch', bridge.fetch)
        const store = openDraft()
        const agents = useAgentStore()
        const sibling = agents.startTask(
            {
                prompt: 'Find a contact',
                capabilities: ['chrome'],
                outputSchema: { type: 'object' },
            },
            { kind: 'outreach-contact', postId: 'another-post' },
        )
        await sibling.started
        const failTask = (taskId: string) => {
            if (failure === 'failed')
                bridge.fail(taskId, 'Agent task returned invalid structured output')
            else bridge.complete(taskId, { draftMessage: '', response: '' })
        }

        store.draft = 'Keep my unsaved text'
        await store.requestDraftRevision(post, 'Make it direct')
        const failed = store.taskId!
        failTask(failed)
        await vi.waitFor(() => expect(store.taskRetryAvailable).toBe(true))

        await store.retryTask(post)
        const retry = store.taskId!
        expect(retry).not.toBe(failed)
        expect(store.taskIssue).toBeNull()
        expect(agents.getSession(failed)).toBeNull()
        expect(store.draft).toBe('Keep my unsaved text')
        failTask(retry)
        await vi.waitFor(() => expect(store.taskRetryAvailable).toBe(true))

        await store.requestDraftRevision(post, 'Use a warmer opening')
        const next = store.taskId!
        expect(next).not.toBe(retry)
        expect(store.taskIssue).toBeNull()
        expect(agents.getSession(retry)).toBeNull()
        failTask(next)
        await vi.waitFor(() => expect(store.taskRetryAvailable).toBe(true))

        setActivePinia(createPinia())
        const restoredAgents = useAgentStore()
        await restoredAgents.restoreSessions()
        const restored = openDraft()
        expect(restored.taskIssue).toBeNull()
        expect(restoredAgents.getSession(next)).toBeNull()
        expect(restoredAgents.isTaskActive(sibling.taskId)).toBe(true)
    },
)
