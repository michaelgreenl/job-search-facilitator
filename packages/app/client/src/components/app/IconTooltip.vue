<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
    defineProps<{
        label: string
        placement?: 'top' | 'bottom'
    }>(),
    {
        placement: 'bottom',
    },
)

defineSlots<{
    default(props: { tooltipId: string }): unknown
}>()

const tooltipId = `icon-tooltip-${useId()}`
</script>

<template>
    <span class="icon-tooltip" :class="`icon-tooltip-${placement}`">
        <slot :tooltip-id="tooltipId"></slot>
        <span :id="tooltipId" class="icon-tooltip-content" role="tooltip">{{ label }}</span>
    </span>
</template>

<style scoped lang="scss">
.icon-tooltip {
    position: relative;
    display: inline-flex;

    &-content {
        position: absolute;
        left: 50%;
        z-index: 40;
        width: max-content;
        max-width: 14rem;
        padding: $space-2 $space-3;
        color: $color-ink;
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1.2;
        pointer-events: none;
        background: $color-night-navigation;
        border: 1px solid $color-ink-alpha-16;
        border-radius: $radius-md;
        box-shadow: 0 8px 20px $color-black-alpha-24;
        opacity: 0;
        transition:
            opacity 120ms ease,
            transform 120ms ease;
    }

    &-bottom &-content {
        top: calc(100% + $space-2);
        transform: translate(-50%, -$space-1) scale(0.98);
        transform-origin: top center;
    }

    &-top &-content {
        bottom: calc(100% + $space-2);
        transform: translate(-50%, $space-1) scale(0.98);
        transform-origin: bottom center;
    }

    &:hover &-content,
    &:focus-within &-content {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
    }
}
</style>
