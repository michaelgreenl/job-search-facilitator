<script setup lang="ts">
import ArrowLeftIcon from '@/components/svgs/ArrowLeftIcon.vue'

withDefaults(
    defineProps<{
        label: string
        mobileOnly?: boolean
        disabled?: boolean
    }>(),
    {
        mobileOnly: false,
        disabled: false,
    },
)

const emit = defineEmits<{
    back: []
}>()
</script>

<template>
    <button
        class="back-button"
        :class="{ 'back-button-mobile-only': mobileOnly }"
        type="button"
        :aria-label="label"
        :disabled="disabled"
        @click="emit('back')"
    >
        <ArrowLeftIcon class="back-button-icon" />
    </button>
</template>

<style scoped lang="scss">
.back-button {
    width: fit-content;
    padding: 0;
    color: $color-ink-muted;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.5;
    }

    &-mobile-only {
        @include bp-md-tablet {
            display: none;
        }
    }
}

.back-button-icon {
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
