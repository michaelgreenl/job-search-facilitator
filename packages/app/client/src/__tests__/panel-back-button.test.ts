/** @vitest-environment jsdom */

import { createApp, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PanelBackButton from '../components/layout/PanelBackButton.vue'

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

const makeRect = ({
    height,
    left,
    top,
    width,
}: {
    height: number
    left: number
    top: number
    width: number
}) =>
    ({
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
        x: left,
        y: top,
        toJSON: () => ({}),
    }) satisfies DOMRect

function setViewport(width: number, height: number) {
    Object.defineProperties(window, {
        innerHeight: { configurable: true, value: height },
        innerWidth: { configurable: true, value: width },
    })
}

function mountBackButton(label = 'Back to saved contacts') {
    const root = document.createElement('div')
    const app = createApp(PanelBackButton, { label })
    document.body.append(root)
    app.mount(root)
    mountedApps.push({ app, root })

    const button = root.querySelector<HTMLButtonElement>('button')
    const trigger = root.querySelector<HTMLElement>('.button-tooltip')
    const tooltipId = button?.getAttribute('aria-describedby')
    const tooltip = tooltipId ? document.getElementById(tooltipId) : null

    if (button === null || trigger === null || tooltip === null) {
        throw new Error('Could not mount the back button tooltip')
    }

    return { button, tooltip, tooltipId, trigger }
}

async function flushPosition() {
    await nextTick()
    await nextTick()
}

describe('panel back button tooltip', () => {
    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }

        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('links the destination label and centers the tooltip below a top-half button', async () => {
        setViewport(1000, 800)
        const { button, tooltip, tooltipId, trigger } = mountBackButton()
        vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
            makeRect({ height: 32, left: 0, top: 100, width: 600 }),
        )
        vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
            makeRect({ height: 32, left: 100, top: 100, width: 40 }),
        )
        vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(
            makeRect({ height: 32, left: 0, top: 0, width: 200 }),
        )

        trigger.dispatchEvent(new MouseEvent('mouseenter'))
        await flushPosition()

        expect(button.getAttribute('aria-describedby')).toBe(tooltipId)
        expect(tooltip.getAttribute('role')).toBe('tooltip')
        expect(tooltip.textContent?.trim()).toBe('Back to saved contacts')
        expect(tooltip.classList.contains('is-visible')).toBe(true)
        expect(tooltip.classList.contains('is-bottom')).toBe(true)
        expect(tooltip.style.left).toBe('120px')
        expect(tooltip.style.top).toBe('140px')

        button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
        await nextTick()
        expect(tooltip.classList.contains('is-visible')).toBe(false)

        trigger.dispatchEvent(new MouseEvent('mouseenter'))
        await flushPosition()
        expect(tooltip.classList.contains('is-visible')).toBe(true)
    })

    it('centers the tooltip above a bottom-half button and updates on resize', async () => {
        setViewport(1000, 800)
        const { button, tooltip, trigger } = mountBackButton('Back to job posts')
        const triggerRect = makeRect({ height: 32, left: 100, top: 600, width: 40 })
        vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(triggerRect)
        vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(triggerRect)

        button.focus()
        await flushPosition()

        expect(document.activeElement).toBe(button)
        expect(tooltip.classList.contains('is-top')).toBe(true)
        expect(tooltip.style.left).toBe('120px')
        expect(tooltip.style.top).toBe('592px')

        setViewport(1000, 1400)
        window.dispatchEvent(new Event('resize'))
        await nextTick()

        expect(tooltip.classList.contains('is-bottom')).toBe(true)
        expect(tooltip.style.top).toBe('640px')

        button.click()
        await nextTick()
        expect(tooltip.classList.contains('is-visible')).toBe(false)
    })

    it('hides after leaving a hovered button that was previously clicked', async () => {
        setViewport(1000, 800)
        const { button, tooltip, trigger } = mountBackButton()
        const triggerRect = makeRect({ height: 32, left: 100, top: 100, width: 40 })
        vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(triggerRect)
        vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(triggerRect)

        button.focus()
        await flushPosition()
        button.click()
        await nextTick()
        expect(tooltip.classList.contains('is-visible')).toBe(false)

        trigger.dispatchEvent(new MouseEvent('mouseenter'))
        await flushPosition()
        expect(tooltip.classList.contains('is-visible')).toBe(true)

        trigger.dispatchEvent(new MouseEvent('mouseleave'))
        await vi.waitFor(() => expect(tooltip.classList.contains('is-visible')).toBe(false))
    })

    it('dismisses an active tooltip when a responsive breakpoint hides its button', async () => {
        setViewport(1000, 800)
        const { button, tooltip, trigger } = mountBackButton()
        let triggerRect = makeRect({ height: 32, left: 100, top: 100, width: 40 })
        vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => triggerRect)
        vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => triggerRect)

        trigger.dispatchEvent(new MouseEvent('mouseenter'))
        await flushPosition()
        expect(tooltip.classList.contains('is-visible')).toBe(true)

        triggerRect = makeRect({ height: 0, left: 0, top: 0, width: 0 })
        window.dispatchEvent(new Event('resize'))
        await nextTick()

        expect(tooltip.classList.contains('is-visible')).toBe(false)
    })
})
