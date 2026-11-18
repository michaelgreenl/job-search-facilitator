<script setup lang="ts">
defineProps<{
    /** Names what the switch turns on or off. */
    accessibleLabel: string
    checked: boolean
    disabled?: boolean
    testId?: string
}>()

const emit = defineEmits<{
    toggle: [checked: boolean]
}>()
</script>

<template>
    <button
        class="base-switch"
        type="button"
        role="switch"
        :aria-checked="checked"
        :aria-label="accessibleLabel"
        :disabled="disabled"
        :data-testid="testId"
        @click="emit('toggle', !checked)"
    >
        <span class="thumb" aria-hidden="true"></span>
    </button>
</template>

<style scoped lang="scss">
.base-switch {
    position: relative;
    flex-shrink: 0;
    width: 2.75rem;
    height: 1.5rem;
    padding: 0;
    cursor: pointer;
    background: $color-ink-alpha-9;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-full;
    transition:
        background-color 140ms ease,
        border-color 140ms ease;

    // A larger area than the track takes a tap.
    &::before {
        position: absolute;
        inset: -0.625rem;
        content: '';
    }

    &:focus-visible {
        outline: 2px solid $color-signal-light;
        outline-offset: 2px;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    &[aria-checked='true'] {
        background: $color-signal-alpha-45;
        border-color: $color-signal-light;
    }

    &:hover:not(:disabled) {
        border-color: $color-signal-light-alpha-50;
    }
}

.thumb {
    position: absolute;
    top: 50%;
    left: 0.1875rem;
    width: 1rem;
    height: 1rem;
    background: $color-ink-secondary;
    border-radius: $radius-full;
    transform: translateY(-50%);
    transition:
        transform 160ms ease,
        background-color 140ms ease;

    [aria-checked='true'] > & {
        background: $color-ink;
        transform: translate(1.25rem, -50%);
    }
}

@media (prefers-reduced-motion: reduce) {
    .base-switch,
    .thumb {
        transition: none;
    }
}
</style>
