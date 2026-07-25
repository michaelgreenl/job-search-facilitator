import { shallowRef } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

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
    results: {
        path: '/results',
        name: 'Results',
        component: () => import('@/views/ResultsView.vue'),
        meta: { title: 'Results' },
    },
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
        { path: '/review', redirect: { name: 'review' } },
        { path: '/:pathMatch(.*)*', redirect: { name: 'review' } },
    ],
})

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
