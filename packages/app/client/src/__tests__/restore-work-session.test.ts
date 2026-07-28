/** @vitest-environment jsdom */

import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { restorePersistedWorkSession } from '@/restore-work-session'
import type { WorkSession } from '@/stores/work.store'

const emptyView = defineComponent({ template: '<main />' })

const createTestRouter = () =>
    createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'review', component: emptyView },
            { path: '/apply', name: 'apply', component: emptyView },
            { path: '/results', name: 'results', component: emptyView },
        ],
    })

describe('persisted Work session startup', () => {
    it.each([
        {
            session: {
                kind: 'job-post-import',
                taskId: 'task-import',
                url: 'https://example.com/job',
            } satisfies WorkSession,
            routeName: 'review',
        },
        {
            session: {
                kind: 'outreach-contact',
                taskId: 'task-outreach',
                postId: 'post-1',
            } satisfies WorkSession,
            routeName: 'apply',
        },
    ])('opens $routeName and reconnects its owner task', async ({ session, routeName }) => {
        const router = createTestRouter()
        await router.push('/results')

        const restoreSessions = vi.fn().mockResolvedValue(undefined)

        await restorePersistedWorkSession(router, {
            sessions: [session],
            restoreSessions,
        })

        expect(router.currentRoute.value.name).toBe(routeName)
        expect(restoreSessions).toHaveBeenCalledOnce()
    })

    it('opens the route for the most recently persisted session and restores all work', async () => {
        const router = createTestRouter()
        await router.push('/results')
        const restoreSessions = vi.fn().mockResolvedValue(undefined)
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
        ] satisfies WorkSession[]

        await restorePersistedWorkSession(router, { sessions, restoreSessions })

        expect(router.currentRoute.value.name).toBe('review')
        expect(restoreSessions).toHaveBeenCalledOnce()
    })
})
