import { getActivePinia } from 'pinia'
import { shallowRef } from 'vue'
import { createRouter, createWebHistory, type NavigationGuard } from 'vue-router'
import { useAgentStore } from '@/stores/agent'

export const navigationFailed = shallowRef(false)

export const navigationRoutes = {
    review: {
        path: '/',
        name: 'Review',
        component: () => import('@/views/ReviewView.vue'),
        meta: { title: 'Review' },
    },
    apply: {
        path: '/apply',
        name: 'Apply',
        component: () => import('@/views/ApplyView.vue'),
        meta: { title: 'Apply' },
    },
    track: {
        path: '/track',
        name: 'Track',
        component: () => import('@/views/TrackView.vue'),
        meta: { title: 'Track' },
    },
}

export const settingsRoute = {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings' },
}

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        ...Object.entries(navigationRoutes).map(([name, route]) => ({
            path: route.path,
            name,
            component: route.component,
            meta: route.meta,
        })),
        settingsRoute,
        { path: '/review', redirect: { name: 'review' } },
        { path: '/:pathMatch(.*)*', redirect: { name: 'review' } },
    ],
})

type AgentSessionStore = Pick<ReturnType<typeof useAgentStore>, 'sessions' | 'restoreSessions'>

export const createPersistedAgentSessionGuard = (
    getAgentStore: () => AgentSessionStore | null,
): NavigationGuard => {
    let startupHandled = false

    return async (to) => {
        if (startupHandled) {
            return
        }

        const agentStore = getAgentStore()

        if (agentStore === null) {
            return
        }

        startupHandled = true
        const session = agentStore.sessions.at(-1)

        if (session === undefined) {
            return
        }

        await agentStore.restoreSessions().catch(() => undefined)
        const routeName = session.kind === 'job-post-import' ? 'review' : 'apply'

        return to.name === routeName ? undefined : { name: routeName }
    }
}

router.beforeEach(
    createPersistedAgentSessionGuard(() => {
        const pinia = getActivePinia()

        return pinia === undefined ? null : useAgentStore(pinia)
    }),
)

router.onError((error) => {
    navigationFailed.value = true
    console.error(error)
})

router.afterEach((to) => {
    let title = 'Job Search Facilitator'

    if (to.meta?.title) {
        title += ` | ${to.meta.title as string}`
    }

    document.title = title
})
