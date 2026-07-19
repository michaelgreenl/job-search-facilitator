<script setup lang="ts">
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
        ←
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
</style>
