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

it('keeps a contact conversation across requests and refresh, while draft acceptance stays explicit', async () => {
    const bridge = new AgentBridgeHarness()
    vi.stubGlobal('fetch', bridge.fetch)
    const store = openDraft()
    await store.requestDraftRevision(post, 'Make the request more specific')
    const first = store.taskId!
    store.draft = 'My edit while the agent works'
    bridge.complete(first, {
        draftMessage: 'Proposed message',
        response: 'A specific question fits this recipient.',
    })
    await vi.waitFor(() => expect(store.draftExchanges).toHaveLength(1))
    expect(store.draft).toBe('My edit while the agent works')
    store.useProposedDraft(first)
    expect(store.draft).toBe('Proposed message')

    await store.requestDraftRevision(post, 'They replied. Help me respond')
    const second = store.taskId!
    expect(bridge.startInputs.get(second)?.threadId).toBe(bridge.tasks.get(first)?.threadId)
    bridge.complete(second, {
        draftMessage: 'Reply draft',
        response: 'This answers their question.',
    })
    await vi.waitFor(() => expect(store.draftExchanges).toHaveLength(2))
    store.draftRequest = 'Unsent follow-up'

    setActivePinia(createPinia())
    const restored = openDraft()
    expect(restored.draftExchanges.map(({ taskId }) => taskId)).toEqual([first, second])
    expect([restored.draft, restored.draftRequest]).toEqual([
        'Proposed message',
        'Unsent follow-up',
    ])
    restored.startNewConversation()
    await restored.requestDraftRevision(post, 'Start again with this draft')
    expect(bridge.startInputs.get(restored.taskId!)?.threadId).toBeUndefined()
    expect(restored.draftExchanges).toHaveLength(0)
    expect(restored.draft).toBe('Proposed message')
})

it.each(['failed', 'invalid-result'] as const)(
    'clears %s errors on retry and refresh without losing the draft or another task',
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
        store.draft = 'Keep my unsaved text'
        await store.requestDraftRevision(post, 'Make it direct')
        const failed = store.taskId!
        if (failure === 'failed')
            bridge.fail(failed, 'Agent task returned invalid structured output')
        else bridge.complete(failed, { draftMessage: '', response: '' })
        await vi.waitFor(() => expect(store.taskRetryAvailable).toBe(true))

        await store.retryTask(post)
        const retry = store.taskId!
        expect(retry).not.toBe(failed)
        expect(store.taskIssue).toBeNull()
        expect(agents.getSession(failed)).toBeNull()
        expect(bridge.startInputs.get(retry)?.threadId).toBeUndefined()
        bridge.fail(retry, 'Agent task returned invalid structured output')
        await vi.waitFor(() => expect(store.taskRetryAvailable).toBe(true))

        setActivePinia(createPinia())
        const restoredAgents = useAgentStore()
        await restoredAgents.restoreSessions()
        const restored = openDraft()
        expect(restored.taskIssue).toBeNull()
        expect(restoredAgents.getSession(retry)).toBeNull()
        expect(restoredAgents.isTaskActive(sibling.taskId)).toBe(true)
        expect([restored.draft, restored.draftRequest]).toEqual([
            'Keep my unsaved text',
            'Make it direct',
        ])
    },
)

it('recovers an unavailable runtime conversation from its successful exchanges', async () => {
    const bridge = new AgentBridgeHarness()
    let rejectResume = false
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        if (rejectResume && init?.method === 'PUT') {
            rejectResume = false
            return new Response(JSON.stringify({ error: 'Saved conversation is unavailable' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }
        return bridge.fetch(input, init)
    })
    const store = openDraft()
    await store.requestDraftRevision(post, 'Make the request direct')
    bridge.complete(store.taskId!, {
        draftMessage: 'Direct draft',
        response: 'A specific question.',
    })
    await vi.waitFor(() => expect(store.draftExchanges).toHaveLength(1))
    rejectResume = true
    await expect(store.requestDraftRevision(post, 'Use a warmer opening')).rejects.toThrow()
    await store.retryTask(post)
    expect(bridge.startInputs.get(store.taskId!)?.threadId).toBeUndefined()
    expect(store.draftExchanges).toHaveLength(1)
    expect(store.taskIssue).toBeNull()
})
