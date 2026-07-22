<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, watch } from 'vue'

type TooltipPlacement = 'top' | 'bottom'

const props = defineProps<{
    label: string
}>()

defineSlots<{
    default(props: { tooltipId: string }): unknown
}>()

const tooltipId = `button-tooltip-${useId()}`
const trigger = shallowRef<HTMLElement | null>(null)
const tooltip = shallowRef<HTMLElement | null>(null)
const triggerHovered = shallowRef(false)
const triggerFocused = shallowRef(false)
const tooltipHovered = shallowRef(false)
const dismissed = shallowRef(false)
const placement = shallowRef<TooltipPlacement>('bottom')
const left = shallowRef(0)
const top = shallowRef(0)
let hideTimer: ReturnType<typeof setTimeout> | null = null

const visible = computed(
    () =>
        !dismissed.value && (triggerHovered.value || triggerFocused.value || tooltipHovered.value),
)
const position = computed(() => ({
    left: `${left.value}px`,
    top: `${top.value}px`,
}))

function clearHideTimer() {
    if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
    }
}

function updatePosition() {
    if (trigger.value === null || tooltip.value === null) {
        return
    }

    const triggerRect = trigger.value.getBoundingClientRect()

    if (triggerRect.width <= 0 || triggerRect.height <= 0) {
        dismiss()
        return
    }

    const tooltipRect = tooltip.value.getBoundingClientRect()
    const viewportGutter = 12
    const verticalGap = 8
    const triggerCenter = triggerRect.left + triggerRect.width / 2
    const minimumCenter = viewportGutter + tooltipRect.width / 2
    const maximumCenter = window.innerWidth - viewportGutter - tooltipRect.width / 2

    left.value =
        minimumCenter > maximumCenter
            ? window.innerWidth / 2
            : Math.min(Math.max(triggerCenter, minimumCenter), maximumCenter)
    placement.value =
        triggerRect.top + triggerRect.height / 2 <= window.innerHeight / 2 ? 'bottom' : 'top'
    top.value =
        placement.value === 'bottom'
            ? triggerRect.bottom + verticalGap
            : triggerRect.top - verticalGap
}

function showFromTrigger(source: 'hover' | 'focus') {
    clearHideTimer()
    dismissed.value = false

    if (source === 'hover') {
        triggerHovered.value = true
    } else {
        triggerFocused.value = true
    }

    void nextTick(updatePosition)
}

function hideAfterPointerLeaves() {
    clearHideTimer()
    hideTimer = setTimeout(() => {
        triggerHovered.value = false
        hideTimer = null
    }, 100)
}

function keepOpenFromTooltip() {
    clearHideTimer()
    tooltipHovered.value = true
    triggerHovered.value = false
}

function dismiss() {
    clearHideTimer()
    dismissed.value = true
    triggerHovered.value = false
    tooltipHovered.value = false
}

function handleViewportChange() {
    if (visible.value) {
        updatePosition()
    }
}

watch(
    () => props.label,
    () => {
        if (visible.value) {
            void nextTick(updatePosition)
        }
    },
)

onMounted(() => {
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
    clearHideTimer()
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
    <span
        ref="trigger"
        class="button-tooltip"
        @mouseenter="showFromTrigger('hover')"
        @mouseleave="hideAfterPointerLeaves"
        @focusin="showFromTrigger('focus')"
        @focusout="triggerFocused = false"
        @keydown.esc.stop="dismiss"
        @click="dismiss"
    >
        <slot :tooltip-id="tooltipId"></slot>
        <Teleport to="body">
            <span
                :id="tooltipId"
                ref="tooltip"
                class="button-tooltip-content tooltip-surface"
                :class="[`is-${placement}`, { 'is-visible': visible }]"
                :style="position"
                role="tooltip"
                @mouseenter="keepOpenFromTooltip"
                @mouseleave="tooltipHovered = false"
            >
                {{ label }}
            </span>
        </Teleport>
    </span>
</template>

<style scoped lang="scss">
.button-tooltip {
    display: inline-flex;
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
        transform 150ms ease,
        visibility 150ms ease;

    &.is-bottom {
        transform: translate(-50%, -$space-1);
        transform-origin: top center;
    }

    &.is-top {
        transform: translate(-50%, calc(-100% + #{$space-1}));
        transform-origin: bottom center;
    }

    &.is-visible {
        pointer-events: auto;
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
