import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import BasePanel from '@/components/base/BasePanel.vue'
import BasePanelLayout from '@/components/base/BasePanelLayout.vue'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

function mountPanels() {
    const open = shallowRef(false)
    const alternate = shallowRef(false)
    const title = shallowRef('Main panel')
    const Detail = defineComponent({
        setup: () => () =>
            h(BasePanel, {
                key: String(alternate.value),
                active: true,
                adjacent: false,
                'data-testid': 'motion-detail',
            }),
    })
    const Fixture = defineComponent({
        setup: () => () =>
            h(BasePanelLayout, { 'data-testid': 'motion-layout' }, () => [
                h(BasePanel, {
                    active: true,
                    adjacent: false,
                    title: title.value,
                    'data-testid': 'motion-main',
                }),
                open.value ? h(Detail) : null,
            ]),
    })
    const mounted = mountVue(Fixture)
    return { ...mounted, open, alternate, title }
}

async function flushLayout() {
    await nextTick()
    await nextTick()
}

function seek(layout: HTMLElement, progress: number) {
    const animations = layout.getAnimations({ subtree: true })
    expect(animations.length).toBeGreaterThan(0)
    for (const animation of animations) {
        animation.pause()
        animation.currentTime = Number(animation.effect!.getTiming().duration) * progress
    }
}

afterEach(async () => {
    await page.viewport(1024, 768)
})

describe('panel motion', () => {
    it('resizes without scaling, keeps the row height, and reverses from its current position', async () => {
        const { open, alternate, title, unmount } = mountPanels()
        await flushLayout()
        const layout = page.getByTestId('motion-layout').element() as HTMLElement
        const main = page.getByTestId('motion-main').element()
        const initial = main.getBoundingClientRect()
        const height = layout.getBoundingClientRect().height

        open.value = true
        await flushLayout()
        seek(layout, 0.25)
        const opening = main.getBoundingClientRect()
        expect(opening.width).toBeLessThan(initial.width)
        expect(opening.width).toBeGreaterThan(initial.width / 2)
        expect(getComputedStyle(main).transform).toBe('none')
        expect(layout.getBoundingClientRect().height).toBe(height)
        expect(document.documentElement.scrollWidth).toBe(window.innerWidth)

        title.value = 'Updated panel'
        await flushLayout()
        expect(main.getBoundingClientRect().width).toBeCloseTo(opening.width, 0)

        // Outreach swaps its root when moving between a contact and an agent task.
        alternate.value = true
        await flushLayout()
        seek(layout, 0.5)
        const detailOpacity = Number(
            getComputedStyle(page.getByTestId('motion-detail').element()).opacity,
        )
        expect(detailOpacity).toBeGreaterThan(0)
        expect(detailOpacity).toBeLessThan(1)
        const beforeReverse = main.getBoundingClientRect()

        open.value = false
        await flushLayout()
        seek(layout, 0)
        expect(main.getBoundingClientRect().width).toBeCloseTo(beforeReverse.width, 0)

        for (const animation of layout.getAnimations({ subtree: true })) animation.finish()
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        expect(main.getBoundingClientRect().width).toBe(initial.width)
        expect(getComputedStyle(main).position).toBe('static')
        expect(layout.getBoundingClientRect().height).toBe(height)

        open.value = true
        await flushLayout()
        const running = layout.getAnimations({ subtree: true })
        expect(running.length).toBeGreaterThan(0)
        unmount()
        expect(running.every((animation) => animation.playState === 'idle')).toBe(true)
    })

    it('changes panels immediately when reduced motion is requested', async () => {
        const matchMedia = window.matchMedia.bind(window)
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
            const media = matchMedia(query)
            if (query === '(prefers-reduced-motion: reduce)') {
                Object.defineProperty(media, 'matches', { value: true })
            }
            return media
        })
        const { open } = mountPanels()
        await flushLayout()
        const layout = page.getByTestId('motion-layout').element()
        const main = page.getByTestId('motion-main').element()
        const width = main.getBoundingClientRect().width

        open.value = true
        await flushLayout()

        expect(layout.getAnimations({ subtree: true })).toHaveLength(0)
        expect(main.getBoundingClientRect().width).toBeLessThan(width)
        await expect.element(page.getByTestId('motion-detail')).toBeVisible()
    })
})
