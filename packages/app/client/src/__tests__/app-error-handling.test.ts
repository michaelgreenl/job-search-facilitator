/** @vitest-environment jsdom */

import { createApp, defineComponent, type App as VueApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigationFailed, router as applicationRouter } from '../router'
import App from '../App.vue'

const mountedApps: Array<{ app: VueApp; root: HTMLElement }> = []
const removeApplicationRoutes: Array<() => void> = []

const mountApp = async (component: ReturnType<typeof defineComponent>) => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component },
            { path: '/apply', component },
            { path: '/results', component },
        ],
    })
    await router.push('/')
    await router.isReady()

    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(App)
    app.config.errorHandler = vi.fn()
    app.use(router)
    app.mount(root)
    mountedApps.push({ app, root })

    return root
}

describe('application error handling', () => {
    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }

        for (const removeRoute of removeApplicationRoutes.splice(0)) {
            removeRoute()
        }

        navigationFailed.value = false
        vi.restoreAllMocks()
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

        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(App)
        app.use(applicationRouter)
        app.mount(root)
        mountedApps.push({ app, root })
        vi.spyOn(console, 'error').mockImplementation(() => undefined)

        await expect(applicationRouter.push('/error-handling-broken')).rejects.toThrow()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="app-error-reload"]')).not.toBeNull(),
        )
    })
})
