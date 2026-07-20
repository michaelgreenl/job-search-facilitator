/** @vitest-environment jsdom */

import { createApp, defineComponent, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppHeader from '@/components/app/AppHeader.vue'

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

async function mountHeader() {
    const EmptyRoute = defineComponent({ template: '<div></div>' })
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: EmptyRoute },
            { path: '/apply', component: EmptyRoute },
            { path: '/results', component: EmptyRoute },
        ],
    })
    await router.push('/')
    await router.isReady()

    const root = document.createElement('div')
    document.body.append(root)
    const app = createApp(AppHeader)
    app.use(router)
    app.mount(root)
    mountedApps.push({ app, root })

    return { root, router }
}

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }
})

describe('AppHeader', () => {
    it('uses an accessible workflow-handle disclosure for primary navigation', async () => {
        const { root, router } = await mountHeader()
        const header = root.querySelector<HTMLElement>('header')
        const nav = root.querySelector<HTMLElement>('nav[aria-label="Primary"]')
        const trigger = root.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')

        if (header === null || nav === null || trigger === null) {
            throw new Error('Could not find application navigation')
        }

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(nav.getAttribute('aria-hidden')).toBe('true')
        expect(header.classList.contains('is-open')).toBe(false)

        trigger.click()

        await vi.waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('true')
            expect(trigger.getAttribute('aria-label')).toBe('Close navigation')
            expect(nav.getAttribute('aria-hidden')).toBe('false')
            expect(header.classList.contains('is-open')).toBe(true)
        })

        expect(
            [...nav.querySelectorAll('a')].map(({ textContent }) => textContent?.trim()),
        ).toEqual(['Review', 'Apply', 'Results'])

        trigger.focus()
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        await vi.waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false')
            expect(document.activeElement).toBe(trigger)
        })

        trigger.click()
        const applyLink = [...nav.querySelectorAll<HTMLAnchorElement>('a')].find(
            ({ textContent }) => textContent?.trim() === 'Apply',
        )
        applyLink?.click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.path).toBe('/apply')
            expect(trigger.getAttribute('aria-expanded')).toBe('false')
        })
    })
})
