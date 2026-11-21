import type { RecordedJobUpdate } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import AppHeader from '@/components/AppHeader.vue'
import NotificationBanners from '@/components/notifications/NotificationBanners.vue'
import { useNotificationStore } from '@/stores/notifications'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

const savedUpdate: RecordedJobUpdate = {
    id: '30000000-0000-4000-8000-000000000001',
    jobPostId: '10000000-0000-4000-8000-000000000001',
    company: 'Example Co',
    roleTitle: 'Software Engineer',
    summary: 'The recruiter asked for an interview.',
    occurredAt: '2026-08-18T12:00:00.000Z',
    read: true,
}
const newUpdate = { ...savedUpdate, id: '30000000-0000-4000-8000-000000000002', read: false }
const newerUpdate = { ...savedUpdate, id: '30000000-0000-4000-8000-000000000003', read: false }

/** Starts a store that holds one read update, then gives it each later list in turn. */
const receiveUpdates = async (...lists: RecordedJobUpdate[][]) => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useNotificationStore()

    for (const updates of [[savedUpdate], ...lists]) {
        vi.stubGlobal('fetch', async () => Response.json(updates))
        await store.refreshUpdates()
    }

    return pinia
}

const bounds = (testId: string) => page.getByTestId(testId).element().getBoundingClientRect()

it('stacks banners in the top right corner with the newest banner first', async () => {
    const pinia = await receiveUpdates(
        [newUpdate, savedUpdate],
        [newerUpdate, newUpdate, savedUpdate],
    )
    mountVue(NotificationBanners, { install: (app) => app.use(pinia) })

    await vi.waitFor(() => {
        const newest = bounds(`notification-banner-${newerUpdate.id}`)
        const older = bounds(`notification-banner-${newUpdate.id}`)

        expect(newest.left).toBeGreaterThan(window.innerWidth / 2)
        expect(window.innerWidth - newest.right).toBeLessThan(newest.height)
        expect(older.bottom).toBeLessThan(window.innerHeight / 2)
        expect(newest.bottom).toBeLessThanOrEqual(older.top)
    })
})

it('puts the dismiss button in the top right corner of a banner', async () => {
    const pinia = await receiveUpdates([newUpdate, savedUpdate])
    mountVue(NotificationBanners, { install: (app) => app.use(pinia) })

    await vi.waitFor(() => {
        const banner = bounds(`notification-banner-${newUpdate.id}`)
        const dismiss = bounds('notification-banner-dismiss')

        expect(dismiss.left).toBeGreaterThan(banner.left + banner.width / 2)
        expect(dismiss.bottom).toBeLessThanOrEqual(banner.top + banner.height / 2)
    })
})

it('shows the unread count on the top right corner of the bell', async () => {
    const pinia = await receiveUpdates([newUpdate, savedUpdate])
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/:path(.*)*', component: { render: () => null } }],
    })
    mountVue(AppHeader, {
        install: (app) => {
            app.use(pinia)
            app.use(router)
        },
    })

    await expect.element(page.getByTestId('notification-count')).toBeVisible()
    const bell = bounds('nav-link-notifications')
    const count = bounds('notification-count')

    expect(count.left + count.width / 2).toBeGreaterThan(bell.left + bell.width / 2)
    expect(count.top + count.height / 2).toBeLessThan(bell.top + bell.height / 2)
})
