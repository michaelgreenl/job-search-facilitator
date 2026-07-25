<script setup lang="ts">
import ButtonTooltip from '@/components/app/ButtonTooltip.vue'
import ArrowLeftIcon from '@/components/svgs/ArrowLeftIcon.vue'

withDefaults(
    defineProps<{
        label: string
        mobileOnly?: boolean
        testId?: string
    }>(),
    {
        mobileOnly: false,
    },
)

const emit = defineEmits<{
    back: []
}>()
</script>

<template>
    <ButtonTooltip
        v-slot="{ tooltipId }"
        :label="label"
        :class="{ 'back-button-mobile-only': mobileOnly }"
    >
        <button
            class="back-button"
            type="button"
            :data-testid="testId"
            :aria-label="label"
            :aria-describedby="tooltipId"
            @click="emit('back')"
        >
            <ArrowLeftIcon class="back-button-icon" />
        </button>
    </ButtonTooltip>
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
