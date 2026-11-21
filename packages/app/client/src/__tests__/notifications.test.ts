/** @vitest-environment jsdom */

import type { AgentTaskEvent, RecordedJobUpdate } from '@job-search-facilitator/core'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentStream from '@/components/agent/AgentStream.vue'
import NotificationBanners from '@/components/notifications/NotificationBanners.vue'
import { router } from '@/router'
import { useAgentStore } from '@/stores/agent'
import { useJobPostImportStore } from '@/stores/job-post-import'
import { useNotificationStore } from '@/stores/notifications'
import { makeAgentTask, makeAgentTaskState } from '@/test/fixtures/agent'
import { jsonResponse } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'
import NotificationsView from '@/views/NotificationsView.vue'

const savedUpdate: RecordedJobUpdate = {
    id: '30000000-0000-4000-8000-000000000001',
    jobPostId: '10000000-0000-4000-8000-000000000001',
    company: 'Example Co',
    roleTitle: 'Software Engineer',
    summary: 'The recruiter asked for an interview.',
    occurredAt: '2026-08-18T12:00:00.000Z',
    read: true,
}
const newUpdate: RecordedJobUpdate = {
    ...savedUpdate,
    id: '30000000-0000-4000-8000-000000000002',
    occurredAt: '2026-08-19T12:00:00.000Z',
    read: false,
}
const newerUpdate: RecordedJobUpdate = {
    ...savedUpdate,
    id: '30000000-0000-4000-8000-000000000003',
    occurredAt: '2026-08-20T12:00:00.000Z',
    read: false,
}
const permissionRequired = {
    type: 'permission-required',
    permission: {
        id: 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4',
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://example.com?',
        origin: 'https://example.com',
    },
    createdAt: '2026-08-21T12:00:00.000Z',
} satisfies AgentTaskEvent

let pinia: Pinia
let servedUpdates: RecordedJobUpdate[]
let savedChanges: unknown[]

/** Gives the store the list of updates that the server now holds. */
const receiveUpdates = async (updates: RecordedJobUpdate[]) => {
    servedUpdates = updates
    await useNotificationStore().refreshUpdates()
}

/** Puts a running job-post import in the Agent store with a permission prompt open. */
const requestImportPermission = async () => {
    const agentStore = useAgentStore()
    const task = makeAgentTask()

    agentStore.sessions = [
        { kind: 'job-post-import', taskId: task.id, url: 'https://example.com/jobs/1' },
    ]
    agentStore.taskStates = {
        [task.id]: makeAgentTaskState(task, {
            events: [permissionRequired],
            pendingPermission: permissionRequired.permission,
        }),
    }
    await nextTick()

    return task
}

const bannerIds = () => useNotificationStore().banners.map(({ id }) => id)

describe('notifications', () => {
    beforeEach(async () => {
        pinia = createPinia()
        setActivePinia(pinia)
        servedUpdates = []
        savedChanges = []
        vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method !== 'PATCH') {
                return jsonResponse(servedUpdates)
            }

            savedChanges.push(JSON.parse(init.body as string))
            return new Response(null, { status: 204 })
        })
        await router.push('/track')
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('counts each unread update and raises banners only after the first list', async () => {
        const store = useNotificationStore()

        await receiveUpdates([newUpdate, savedUpdate])
        expect(store.unreadCount).toBe(1)
        expect(bannerIds()).toEqual([])

        await receiveUpdates([newerUpdate, newUpdate, savedUpdate])
        expect(store.unreadCount).toBe(2)
        expect(bannerIds()).toEqual([newerUpdate.id])
    })

    it('puts the most recent banner at the top of the stack', async () => {
        await receiveUpdates([savedUpdate])
        await receiveUpdates([newUpdate, savedUpdate])
        await receiveUpdates([newerUpdate, newUpdate, savedUpdate])

        expect(bannerIds()).toEqual([newerUpdate.id, newUpdate.id])
    })

    it('opens the job post of an update on Track and clears the update', async () => {
        const store = useNotificationStore()
        await router.push('/')
        await receiveUpdates([savedUpdate])
        await receiveUpdates([newUpdate, savedUpdate])

        await store.open(store.notifications.find(({ id }) => id === newUpdate.id)!)

        expect(router.currentRoute.value.name).toBe('track')
        expect(router.currentRoute.value.query.post).toBe(newUpdate.jobPostId)
        expect(store.notifications.map(({ id }) => id)).toEqual([savedUpdate.id])
        expect(savedChanges).toEqual([{ ids: [newUpdate.id], state: 'cleared' }])
    })

    it('raises a permission prompt on the screen of its task until the prompt is in view', async () => {
        const store = useNotificationStore()
        await router.push('/')

        const task = await requestImportPermission()
        expect(store.unreadCount).toBe(1)
        expect(bannerIds()).toEqual([permissionRequired.permission.id])

        mountVue(AgentStream, {
            props: { taskId: task.id, issue: null },
            install: (app) => app.use(pinia),
        })
        expect(store.notifications).toEqual([])
    })

    it('opens the Agent task of a permission prompt', async () => {
        const store = useNotificationStore()
        const task = await requestImportPermission()

        await store.open(store.notifications[0]!)

        expect(router.currentRoute.value.name).toBe('review')
        expect(useJobPostImportStore().taskId).toBe(task.id)
    })

    it('loads the screen of a permission prompt again when that screen is open', async () => {
        const store = useNotificationStore()
        await router.push('/')
        await requestImportPermission()
        const visit = store.screenVisit

        await store.open(store.notifications[0]!)

        expect(store.screenVisit).toBe(visit + 1)
    })

    it('removes the notification when the permission prompt is answered', async () => {
        const store = useNotificationStore()
        const task = await requestImportPermission()
        const agentStore = useAgentStore()

        agentStore.taskStates = {
            [task.id]: makeAgentTaskState(task, { events: [permissionRequired] }),
        }

        expect(store.notifications).toEqual([])
    })

    it('marks each notification as read when the notifications page opens', async () => {
        const store = useNotificationStore()
        await receiveUpdates([newUpdate, savedUpdate])

        mountVue(NotificationsView, { install: (app) => app.use(pinia) })

        expect(store.unreadCount).toBe(0)
        expect(savedChanges).toEqual([{ ids: [newUpdate.id], state: 'read' }])
    })

    it('clears one notification or all notifications from the notifications page', async () => {
        const store = useNotificationStore()
        await receiveUpdates([newerUpdate, newUpdate, savedUpdate])
        const { root } = mountVue(NotificationsView, { install: (app) => app.use(pinia) })
        const click = (testId: string) =>
            root.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click()

        click('notification-clear')
        expect(store.notifications.map(({ id }) => id)).toEqual([newUpdate.id, savedUpdate.id])

        click('clear-notifications')
        expect(store.notifications).toEqual([])
    })

    it('removes a banner after 7 seconds and keeps its notification unread', async () => {
        vi.useFakeTimers()
        const store = useNotificationStore()
        servedUpdates = [savedUpdate]
        mountVue(NotificationBanners, { install: (app) => app.use(pinia) })
        await vi.advanceTimersByTimeAsync(0)
        servedUpdates = [newUpdate, savedUpdate]
        await vi.advanceTimersByTimeAsync(60_000)
        expect(bannerIds()).toEqual([newUpdate.id])

        await vi.advanceTimersByTimeAsync(6_999)
        expect(bannerIds()).toEqual([newUpdate.id])

        await vi.advanceTimersByTimeAsync(1)
        expect(bannerIds()).toEqual([])
        expect(store.unreadCount).toBe(1)
    })
})
