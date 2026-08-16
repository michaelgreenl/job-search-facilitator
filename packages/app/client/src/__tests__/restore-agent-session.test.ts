/** @vitest-environment jsdom */

import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { createPersistedAgentSessionGuard } from '@/router'
import type { AgentSession } from '@/stores/agent'

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
})
