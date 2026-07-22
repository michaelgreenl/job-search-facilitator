<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue'

type TooltipPlacement = 'top' | 'bottom'

defineProps<{
    label: string
}>()

defineSlots<{
    default(props: { tooltipId: string }): unknown
}>()

const tooltipId = `button-tooltip-${useId()}`
const container = useTemplateRef<HTMLElement>('container')
const visible = shallowRef(false)
const placement = shallowRef<TooltipPlacement>('bottom')
const position = shallowRef<CSSProperties>({ left: '0px', top: '0px' })

function triggerElement() {
    const element = container.value?.firstElementChild

    return element instanceof HTMLElement ? element : null
}

function updatePosition() {
    const element = triggerElement()

    if (element === null) {
        return
    }

    const triggerRect = element.getBoundingClientRect()

    if (triggerRect.width <= 0 || triggerRect.height <= 0) {
        hide()
        return
    }

    const verticalGap = 8
    placement.value =
        triggerRect.top + triggerRect.height / 2 <= window.innerHeight / 2 ? 'bottom' : 'top'
    position.value = {
        left: `${triggerRect.left + triggerRect.width / 2}px`,
        top: `${
            placement.value === 'bottom'
                ? triggerRect.bottom + verticalGap
                : triggerRect.top - verticalGap
        }px`,
    }
}

function show() {
    visible.value = true
    updatePosition()
}

function hide() {
    visible.value = false
}

function handleViewportChange() {
    if (visible.value) {
        updatePosition()
    }
}

onMounted(() => {
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
    <span
        ref="container"
        class="button-tooltip"
        @mouseenter="show"
        @mouseleave="hide"
        @focusin="show"
        @focusout="hide"
        @keydown.esc.stop="hide"
        @click="hide"
    >
        <slot :tooltip-id="tooltipId"></slot>
        <Teleport to="body">
            <span
                :id="tooltipId"
                class="button-tooltip-content tooltip-surface"
                :class="[`is-${placement}`, { 'is-visible': visible }]"
                :style="position"
                role="tooltip"
            >
                {{ label }}
            </span>
        </Teleport>
    </span>
</template>

<style scoped lang="scss">
.button-tooltip {
    display: inline-flex;
    width: fit-content;
}

.button-tooltip-content.tooltip-surface {
    position: fixed;
    z-index: 50;
    max-width: min(14rem, calc(100vw - #{$space-6}));
    white-space: normal;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition:
        opacity 150ms ease,
        transform 150ms ease;

    &.is-bottom {
        transform: translate(-50%, -$space-1);
        transform-origin: top center;
    }

    &.is-top {
        transform: translate(-50%, calc(-100% + #{$space-1}));
        transform-origin: bottom center;
    }

    &.is-visible {
        visibility: visible;
        opacity: 1;

        &.is-bottom {
            transform: translate(-50%, 0);
        }

        &.is-top {
            transform: translate(-50%, -100%);
        }
    }
}
</style>
