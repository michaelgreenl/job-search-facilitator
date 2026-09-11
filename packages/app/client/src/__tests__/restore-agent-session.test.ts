/** @vitest-environment jsdom */

import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPersistedAgentSessionGuard } from '@/router'
import { useAgentStore, type AgentSession } from '@/stores/agent'
import { makeAgentTask } from '@/test/fixtures/agent'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { MemoryStorage } from '@/test/support/memory-storage'
import { writeAgentSessions, readAgentSessions } from '@/services/agent/agent-session'

beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.stubGlobal('EventSource', FakeEventSource)
})

const emptyView = defineComponent({ template: '<main />' })

const createTestRouter = () =>
    createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'review', component: emptyView },
            { path: '/apply', name: 'apply', component: emptyView },
            { path: '/track', name: 'track', component: emptyView },
        ],
    })

describe('persisted Agent session startup', () => {
    it.each([
        {
            session: {
                kind: 'job-post-import',
                taskId: 'task-import',
                url: 'https://example.com/job',
            } satisfies AgentSession,
            routeName: 'review',
        },
        {
            session: {
                kind: 'outreach-contact',
                taskId: 'task-outreach',
                postId: 'post-1',
            } satisfies AgentSession,
            routeName: 'apply',
        },
    ])('opens $routeName and reconnects its owner task', async ({ session, routeName }) => {
        const router = createTestRouter()
        const agentStore = {
            sessions: [session],
            dismissFailedTasks: vi.fn(),
            restoreSessions: vi.fn().mockResolvedValue(undefined),
        }
        router.beforeEach(createPersistedAgentSessionGuard(() => agentStore))

        await router.push('/track')

        expect(router.currentRoute.value.name).toBe(routeName)
        expect(agentStore.restoreSessions).toHaveBeenCalledOnce()
    })

    it('opens the route for the most recently persisted session and restores all tasks', async () => {
        const router = createTestRouter()
        const sessions = [
            {
                kind: 'outreach-contact',
                taskId: 'task-outreach',
                postId: 'post-1',
            },
            {
                kind: 'job-post-import',
                taskId: 'task-import',
                url: 'https://example.com/job',
            },
        ] satisfies AgentSession[]
        const agentStore = {
            sessions,
            dismissFailedTasks: vi.fn(),
            restoreSessions: vi.fn().mockResolvedValue(undefined),
        }
        router.beforeEach(createPersistedAgentSessionGuard(() => agentStore))

        await router.push('/track')

        expect(router.currentRoute.value.name).toBe('review')
        expect(agentStore.restoreSessions).toHaveBeenCalledOnce()
    })

    it('allows later navigation while an active session remains persisted', async () => {
        const router = createTestRouter()
        const agentStore = {
            dismissFailedTasks: vi.fn(),
            sessions: [
                {
                    kind: 'job-post-import',
                    taskId: 'task-import',
                    url: 'https://example.com/job',
                },
            ] satisfies AgentSession[],
            restoreSessions: vi.fn().mockResolvedValue(undefined),
        }
        router.beforeEach(createPersistedAgentSessionGuard(() => agentStore))

        await router.push('/track')
        await router.push('/track')

        expect(router.currentRoute.value.name).toBe('track')
    })

    it.each(['failed', 'failed-outcome', 'invalid-result', 'missing'] as const)(
        'discards a persisted %s task before choosing a startup route',
        async (failure) => {
            const bridge = new AgentBridgeHarness()
            vi.stubGlobal('fetch', bridge.fetch)
            const active = makeAgentTask()
            const stale = makeAgentTask({ id: '11111111-1111-4111-8111-111111111111' })
            bridge.seedTask(active)
            if (failure !== 'missing') {
                bridge.seedTask(
                    failure === 'failed'
                        ? { ...stale, status: 'failed', output: null, error: 'Lookup failed' }
                        : {
                              ...stale,
                              status: 'completed',
                              output:
                                  failure === 'failed-outcome'
                                      ? {
                                            outcome: 'failed',
                                            contact: null,
                                            error: 'No verified contact',
                                        }
                                      : {},
                              error: null,
                          },
                )
            }
            const activeSession: AgentSession = {
                kind: 'job-post-import',
                taskId: active.id,
                url: 'https://example.com/job',
            }
            writeAgentSessions([
                activeSession,
                { kind: 'outreach-contact', taskId: stale.id, postId: 'old-role' },
            ])
            const store = useAgentStore()
            const router = createTestRouter()
            router.beforeEach(createPersistedAgentSessionGuard(() => store))

            await router.push('/track')

            expect(store.sessions).toEqual([activeSession])
            expect(readAgentSessions()).toEqual([activeSession])
            expect(store.getTaskState(stale.id)).toBeNull()
            expect(router.currentRoute.value.name).toBe('review')
            expect(store.isTaskActive(active.id)).toBe(true)
        },
    )

    it('keeps the requested route when every saved task failed', async () => {
        const bridge = new AgentBridgeHarness()
        vi.stubGlobal('fetch', bridge.fetch)
        const task = makeAgentTask()
        bridge.seedTask({ ...task, status: 'failed', output: null, error: 'Lookup failed' })
        writeAgentSessions([{ kind: 'outreach-contact', taskId: task.id, postId: 'old-role' }])
        const store = useAgentStore()
        const router = createTestRouter()
        router.beforeEach(createPersistedAgentSessionGuard(() => store))

        await router.push('/track')

        expect(router.currentRoute.value.name).toBe('track')
        expect(store.sessions).toEqual([])
        expect(readAgentSessions()).toEqual([])
    })

    it('removes a failed task when leaving its route while another task keeps running', async () => {
        const bridge = new AgentBridgeHarness()
        vi.stubGlobal('fetch', bridge.fetch)
        const store = useAgentStore()
        const router = createTestRouter()
        router.beforeEach(createPersistedAgentSessionGuard(() => store))
        await router.push('/apply')
        const input = {
            prompt: 'Find a contact',
            capabilities: [],
            outputSchema: { type: 'object' as const },
        }
        const failed = store.startTask(input, { kind: 'outreach-contact', postId: 'first-role' })
        const active = store.startTask(input, { kind: 'outreach-contact', postId: 'second-role' })
        await Promise.all([failed.started, active.started])
        bridge.complete(failed.taskId, {
            outcome: 'failed',
            contact: null,
            error: 'No verified contact',
        })
        expect(store.getSession(failed.taskId)).not.toBeNull()

        await router.push('/track')
        await router.push('/apply')

        expect(store.getSession(failed.taskId)).toBeNull()
        expect(store.getTaskState(failed.taskId)).toBeNull()
        expect(store.isTaskActive(active.taskId)).toBe(true)
        expect(readAgentSessions().map(({ taskId }) => taskId)).toEqual([active.taskId])
    })
})
