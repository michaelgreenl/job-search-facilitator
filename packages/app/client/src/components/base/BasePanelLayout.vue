<script lang="ts">
import type { InjectionKey } from 'vue'

export const panelLayoutChange: InjectionKey<() => void> = Symbol('panelLayoutChange')
</script>

<script setup lang="ts">
import { useEventListener, usePreferredReducedMotion } from '@vueuse/core'
import { nextTick, onBeforeUnmount, onBeforeUpdate, provide, useTemplateRef, watch } from 'vue'

withDefaults(defineProps<{ as?: 'div' | 'section' }>(), { as: 'div' })

const layout = useTemplateRef<HTMLElement>('layout')
const reducedMotion = usePreferredReducedMotion()
const timing = { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
let previous = new Map<HTMLElement, DOMRect>()
let opacity = new Map<HTMLElement, string>()
let destinations = new Map<HTMLElement, DOMRect>()
let animations: Animation[] = []
let pending = false
let disposed = false

function measure() {
    return new Map(
        Array.from(layout.value?.children ?? [])
            .filter((child): child is HTMLElement => child instanceof HTMLElement)
            .filter((child) => child.getClientRects().length > 0)
            .map((child) => [child, child.getBoundingClientRect()]),
    )
}

function stop() {
    for (const animation of animations) animation.cancel()
    animations = []
}

function sameRect(first: DOMRect | undefined, second: DOMRect) {
    return (
        first !== undefined &&
        Math.abs(first.x - second.x) < 1 &&
        Math.abs(first.y - second.y) < 1 &&
        Math.abs(first.width - second.width) < 1 &&
        Math.abs(first.height - second.height) < 1
    )
}

function schedule() {
    if (pending || disposed) return
    pending = true
    previous = measure()
    opacity = new Map([...previous.keys()].map((panel) => [panel, getComputedStyle(panel).opacity]))
    void nextTick(() => {
        pending = false
        if (!disposed) animateLayout()
    })
}

function animateLayout() {
    const element = layout.value
    if (!element) return

    const interrupted = animations.map((animation) => ({ animation, time: animation.currentTime }))
    stop()
    const next = measure()

    if (reducedMotion.value === 'reduce' || typeof element.animate !== 'function') return

    // Content updates must not restart an in-flight layout transition.
    if (
        interrupted.length &&
        next.size === destinations.size &&
        [...next].every(([panel, rect]) => sameRect(destinations.get(panel), rect))
    ) {
        animations = interrupted.map(({ animation, time }) => {
            animation.currentTime = time
            animation.play()
            return animation
        })
        return
    }

    destinations = next
    if (
        previous.size === 0 ||
        (next.size === previous.size &&
            [...next].every(([panel, rect]) => sameRect(previous.get(panel), rect)))
    ) {
        return
    }

    const bounds = element.getBoundingClientRect()
    // Hold the row's height while panels move independently, without scaling their text.
    const row = { height: `${bounds.height}px`, overflowX: 'clip' }
    animations.push(element.animate([row, row], timing))
    for (const [panel, rect] of next) {
        const from = previous.get(panel)
        const frame = (box: DOMRect): Keyframe => ({
            position: 'absolute',
            left: `${box.left - bounds.left}px`,
            top: `${box.top - bounds.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
            minWidth: '0',
            maxWidth: 'none',
            margin: '0',
        })

        animations.push(
            panel.animate(
                [
                    {
                        ...frame(from ?? rect),
                        opacity: opacity.get(panel) ?? 0,
                        translate: from ? '0' : '24px',
                    },
                    { ...frame(rect), opacity: 1, translate: '0' },
                ],
                timing,
            ),
        )
    }
    for (const animation of animations) {
        animation.onfinish = () => {
            animations = animations.filter((running) => running !== animation)
        }
    }
}

provide(panelLayoutChange, schedule)
onBeforeUpdate(schedule)
useEventListener('resize', stop)
watch(reducedMotion, stop)
onBeforeUnmount(() => {
    disposed = true
    stop()
})
</script>

<template>
    <component :is="as" ref="layout" class="base-panel-layout">
        <slot />
    </component>
</template>

<style scoped lang="scss">
.base-panel-layout {
    position: relative;
    display: flex;
    flex: 1;
    gap: $space-4;
    min-height: 0;
    min-width: 0;
    isolation: isolate;
}
</style>
