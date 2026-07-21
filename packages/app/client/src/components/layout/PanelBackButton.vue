<script setup lang="ts">
import AppIcon from '@/components/app/AppIcon.vue'
import IconTooltip from '@/components/app/IconTooltip.vue'

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
    <IconTooltip
        v-slot="{ tooltipId }"
        :class="{ 'back-button-tooltip-mobile-only': mobileOnly }"
        :label="label"
    >
        <button
            class="back-button"
            type="button"
            :aria-label="label"
            :aria-describedby="tooltipId"
            :disabled="disabled"
            @click="emit('back')"
        >
            <AppIcon class="back-button-icon" name="back" />
        </button>
    </IconTooltip>
</template>

<style scoped lang="scss">
.back-button {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: $color-ink-muted;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: $radius-md;
    place-items: center;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-ink-alpha-9;
        border-color: $color-ink-alpha-12;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.5;
    }
}

.back-button-icon {
    width: 1.125rem;
    height: 1.125rem;
}

.back-button-tooltip-mobile-only {
    @include bp-md-tablet {
        display: none;
    }
}
</style>
