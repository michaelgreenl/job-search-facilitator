<script lang="ts">
export type BaseButtonElement = 'a' | 'button'
export type BaseButtonIconSize = 'sm' | 'md' | 'lg'
export type BaseButtonPreset = 'back' | 'card' | 'icon' | 'outline' | 'primary' | 'signal' | 'text'
</script>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import {
    computed,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    useAttrs,
    useId,
    useTemplateRef,
    watch,
} from 'vue'

type TooltipPlacement = 'top' | 'bottom'

interface Props {
    as?: BaseButtonElement
    iconSize?: BaseButtonIconSize
    preset?: BaseButtonPreset
    tooltip?: string
    type?: 'button' | 'reset' | 'submit'
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<Props>(), {
    as: 'button',
    preset: 'primary',
    type: 'button',
})
const attrs = useAttrs()
const tooltipId = `button-tooltip-${useId()}`
const button = useTemplateRef<HTMLElement>('button')
const tooltipSurface = useTemplateRef<HTMLElement>('tooltipSurface')
const visible = shallowRef(false)
const keyboardInteraction = shallowRef(true)
const placement = shallowRef<TooltipPlacement>('bottom')
const position = shallowRef<CSSProperties>({ left: '0px', top: '0px' })
const rootAttrs = computed(() => ({
    class: attrs.class,
    style: attrs.style,
}))
const buttonAttrs = computed(() => {
    const { class: _class, style: _style, 'aria-describedby': _ariaDescribedby, ...rest } = attrs

    return rest
})
const buttonClass = computed(() => [
    'base-button',
    `preset-${props.preset}`,
    props.iconSize ? `icon-size-${props.iconSize}` : undefined,
])
let mounted = false
let tooltipListenersAttached = false

function describedBy(tooltipId: string) {
    const existing = attrs['aria-describedby']

    return existing ? `${String(existing)} ${tooltipId}` : tooltipId
}

function focus() {
    button.value?.focus()
}

function updateTooltipPosition() {
    const trigger = button.value
    const tooltipElement = tooltipSurface.value

    if (trigger === null || tooltipElement === null) {
        return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const tooltipRect = tooltipElement.getBoundingClientRect()

    if (triggerRect.width <= 0 || triggerRect.height <= 0) {
        hideTooltip()
        return
    }

    const verticalGap = 8
    const viewportGutter = 12
    const triggerCenter = triggerRect.left + triggerRect.width / 2
    const tooltipHalfWidth = tooltipRect.width / 2
    const minimumCenter = viewportGutter + tooltipHalfWidth
    const maximumCenter = window.innerWidth - viewportGutter - tooltipHalfWidth
    const horizontalCenter =
        minimumCenter <= maximumCenter
            ? Math.min(Math.max(triggerCenter, minimumCenter), maximumCenter)
            : window.innerWidth / 2
    placement.value =
        triggerRect.top + triggerRect.height / 2 <= window.innerHeight / 2 ? 'bottom' : 'top'
    position.value = {
        left: `${horizontalCenter}px`,
        top: `${
            placement.value === 'bottom'
                ? triggerRect.bottom + verticalGap
                : triggerRect.top - verticalGap
        }px`,
    }
}

function showTooltip() {
    visible.value = true
    updateTooltipPosition()
}

function hideTooltip() {
    visible.value = false
}

function handleKeyboardInput(event: KeyboardEvent) {
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        keyboardInteraction.value = true
    }
}

function handlePointerInput() {
    keyboardInteraction.value = false
}

function handleFocusIn() {
    if (keyboardInteraction.value) {
        showTooltip()
    }
}

function isInsideTrigger(target: EventTarget | null) {
    return target instanceof Node && button.value?.contains(target)
}

function handleMouseOver(event: MouseEvent) {
    if (isInsideTrigger(event.target)) {
        showTooltip()
    }
}

function handleMouseOut(event: MouseEvent) {
    if (!isInsideTrigger(event.relatedTarget)) {
        hideTooltip()
    }
}

function handleViewportChange() {
    if (visible.value) {
        updateTooltipPosition()
    }
}

function attachTooltipListeners() {
    if (tooltipListenersAttached) {
        return
    }

    window.addEventListener('keydown', handleKeyboardInput, true)
    window.addEventListener('pointerdown', handlePointerInput, true)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    tooltipListenersAttached = true
}

function detachTooltipListeners() {
    if (!tooltipListenersAttached) {
        return
    }

    window.removeEventListener('keydown', handleKeyboardInput, true)
    window.removeEventListener('pointerdown', handlePointerInput, true)
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange, true)
    tooltipListenersAttached = false
}

watch(
    () => props.tooltip,
    (tooltipLabel) => {
        if (!mounted) {
            return
        }

        if (tooltipLabel) {
            attachTooltipListeners()
        } else {
            hideTooltip()
            detachTooltipListeners()
        }
    },
)

onMounted(() => {
    mounted = true

    if (props.tooltip) {
        attachTooltipListeners()
    }
})

onBeforeUnmount(detachTooltipListeners)

defineExpose({ focus })
</script>

<template>
    <span
        v-if="props.tooltip"
        class="button-tooltip"
        v-bind="rootAttrs"
        @mouseover="handleMouseOver"
        @mouseout="handleMouseOut"
        @focusin="handleFocusIn"
        @focusout="hideTooltip"
        @keydown.esc.stop="hideTooltip"
        @click="hideTooltip"
    >
        <component
            :is="props.as"
            ref="button"
            v-bind="buttonAttrs"
            :class="buttonClass"
            :type="props.as === 'button' ? props.type : undefined"
            :aria-describedby="describedBy(tooltipId)"
        >
            <slot />
        </component>
        <Teleport to="body">
            <span
                :id="tooltipId"
                ref="tooltipSurface"
                class="content tooltip-surface"
                data-testid="button-tooltip-content"
                :class="[`is-${placement}`, { 'is-visible': visible }]"
                :style="position"
                role="tooltip"
            >
                {{ props.tooltip }}
            </span>
        </Teleport>
    </span>
    <component
        v-else
        :is="props.as"
        ref="button"
        v-bind="attrs"
        :class="buttonClass"
        :type="props.as === 'button' ? props.type : undefined"
    >
        <slot />
    </component>
</template>

<style scoped lang="scss">
.base-button {
    box-sizing: border-box;
    font: inherit;
    cursor: pointer;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }
}

.preset-primary {
    display: inline-flex;
    gap: $space-2;
    align-items: center;
    justify-content: center;
    padding: $space-2 $space-3;
    color: $color-ink;
    font-weight: 650;
    text-decoration: none;
    background: $color-action;
    border: 0;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }
}

.preset-outline {
    display: inline-flex;
    gap: $space-2;
    align-items: center;
    justify-content: center;
    padding: $space-2 $space-3;
    color: $color-ink;
    background: transparent;
    border: 1px solid $color-signal-light-alpha-28;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        border-color: $color-signal-light;
    }
}

.preset-signal {
    display: inline-flex;
    gap: $space-2;
    align-items: center;
    justify-content: center;
    padding: $space-2 $space-3;
    color: $color-night;
    font-weight: 650;
    background: $color-signal-light;
    border: 1px solid transparent;
    border-radius: $radius-md;
}

.preset-text {
    display: inline-flex;
    width: fit-content;
    padding: 0;
    color: $color-signal-light;
    text-decoration: none;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }
}

.preset-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: $color-ink-muted;
    line-height: 1;
    background: transparent;
    border: 0;
    border-radius: $radius-sm;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }
}

.preset-back {
    display: inline-flex;
    width: fit-content;
    padding: 0;
    color: $color-ink-muted;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }
}

.preset-card {
    display: grid;
    width: 100%;
    color: $color-ink;
    text-align: start;
    text-decoration: none;
    background: $color-ink-alpha-5;
    border: 1px solid $color-ink-alpha-9;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal-alpha-9;
        border-color: $color-signal-alpha-28;
    }
}

.icon-size-sm,
.icon-size-md,
.icon-size-lg {
    padding: 0;
    line-height: 1;
}

.icon-size-sm {
    width: 2rem;
    height: 2rem;
}

.icon-size-md {
    width: 2.25rem;
    height: 2.25rem;
}

.icon-size-lg {
    width: 2.75rem;
    height: 2.75rem;
}

.button-tooltip {
    display: inline-flex;
    width: fit-content;
}

.content.tooltip-surface {
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

<style lang="scss">
.base-button.preset-back svg {
    width: 0.875rem;
    height: 1rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
    vertical-align: -0.125em;
}
</style>
