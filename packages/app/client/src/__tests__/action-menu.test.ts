/** @vitest-environment jsdom */

import { createApp, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActionMenu, { type ActionMenuItem } from '@/components/app/ActionMenu.vue'

const items: ActionMenuItem[] = [
    { value: 'P1', label: 'P1', tone: 'priority-high' },
    { value: 'P2', label: 'P2', tone: 'priority-medium' },
    { value: 'applied', label: 'Applied', tone: 'success' },
    { value: 'clear', label: 'Clear label', tone: 'muted', separatorBefore: true },
]

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

function mountActionMenu(onSelect = vi.fn()) {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ActionMenu, {
        buttonLabel: 'Job post label',
        disabled: false,
        items,
        label: 'Change label',
        onSelect,
    })
    app.mount(root)
    mountedApps.push({ app, root })

    return { onSelect, root }
}

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }
})

describe('ActionMenu', () => {
    it('supports menu-button keyboard navigation and selection', async () => {
        const { onSelect, root } = mountActionMenu()
        const trigger = root.querySelector<HTMLButtonElement>('[aria-label="Job post label"]')

        if (trigger === null) {
            throw new Error('Could not find action menu trigger')
        }

        expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(trigger.querySelector('.app-icon-chevron-down')).not.toBeNull()

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))

        await vi.waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('true')
            expect(document.activeElement?.textContent?.trim()).toBe('P1')
        })

        document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
        )
        await nextTick()
        expect(document.activeElement?.textContent?.trim()).toBe('P2')

        document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
        )
        await nextTick()
        expect(document.activeElement?.textContent?.trim()).toBe('Clear label')

        document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        )

        await vi.waitFor(() => {
            expect(root.querySelector('[role="menu"]')).toBeNull()
            expect(document.activeElement).toBe(trigger)
        })

        trigger.click()
        await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).not.toBeNull())
        const applied = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
            ({ textContent }) => textContent?.trim() === 'Applied',
        )

        expect(applied?.classList.contains('action-menu-item-success')).toBe(true)
        applied?.click()

        await vi.waitFor(() => {
            expect(onSelect).toHaveBeenCalledExactlyOnceWith('applied')
            expect(root.querySelector('[role="menu"]')).toBeNull()
            expect(document.activeElement).toBe(trigger)
        })
    })
})
