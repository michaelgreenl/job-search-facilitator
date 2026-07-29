/** @vitest-environment jsdom */

import { createApp, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BaseCard from '@/components/base/BaseCard.vue'

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }
})

describe('BaseCard', () => {
    it('forwards clicks from button cards with a non-submit type', () => {
        const root = document.createElement('div')
        const onClick = vi.fn()
        document.body.append(root)

        const app = createApp(BaseCard, { as: 'button', onClick })
        app.mount(root)
        mountedApps.push({ app, root })

        const card = root.querySelector<HTMLButtonElement>('button')

        if (card === null) {
            throw new Error('Could not mount button card')
        }

        expect(card.type).toBe('button')
        card.click()
        expect(onClick).toHaveBeenCalledOnce()
    })
})
