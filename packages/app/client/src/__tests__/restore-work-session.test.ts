/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restorePersistedWorkSession } from '@/restore-work-session'
import { useWorkStore, type WorkSession } from '@/stores/work.store'

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
    beforeEach(() => {
        sessionStorage.clear()
    })

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

        const workStore = useWorkStore(createPinia())
        workStore.session = session
        const restoreSession = vi.spyOn(workStore, 'restoreSession').mockResolvedValue(null)

        await restorePersistedWorkSession(router, workStore)

        expect(router.currentRoute.value.name).toBe(routeName)
        expect(restoreSession).toHaveBeenCalledOnce()
    })
})
