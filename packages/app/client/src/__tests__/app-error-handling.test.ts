/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigationFailed, router as applicationRouter } from '../router'
import App from '../App.vue'
import { mountVue } from '@/test/support/mount'

const removeApplicationRoutes: Array<() => void> = []

const mountApp = async (component: ReturnType<typeof defineComponent>) => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component },
            { path: '/apply', component },
            { path: '/track', component },
        ],
    })
    await router.push('/')
    await router.isReady()

    const { root } = mountVue(App, {
        install: (app) => {
            app.config.errorHandler = vi.fn()
            app.use(router)
        },
    })

    return root
}

describe('application error handling', () => {
    afterEach(() => {
        for (const removeRoute of removeApplicationRoutes.splice(0)) {
            removeRoute()
        }

        navigationFailed.value = false
    })

    it('replaces a failed route subtree with document recovery', async () => {
        const brokenView = defineComponent({
            setup() {
                throw new Error('Route render failed')
            },
            template: '<div />',
        })
        const root = await mountApp(brokenView)

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="app-error-reload"]')).not.toBeNull(),
        )
    })

    it('offers document recovery when a lazy route cannot load', async () => {
        const readyView = defineComponent({ template: '<main />' })
        removeApplicationRoutes.push(
            applicationRouter.addRoute({
                path: '/error-handling-ready',
                component: readyView,
            }),
            applicationRouter.addRoute({
                path: '/error-handling-broken',
                component: () => Promise.reject(new Error('Route chunk unavailable')),
            }),
        )
        await applicationRouter.push('/error-handling-ready')
        await applicationRouter.isReady()

        const { root } = mountVue(App, {
            install: (app) => {
                app.use(createPinia())
                app.use(applicationRouter)
            },
        })
        vi.spyOn(console, 'error').mockImplementation(() => undefined)

        await applicationRouter.push('/error-handling-broken').catch(() => undefined)
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="app-error-reload"]')).not.toBeNull(),
        )
    })
})
