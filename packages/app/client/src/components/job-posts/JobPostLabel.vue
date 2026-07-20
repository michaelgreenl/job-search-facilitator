<script setup lang="ts">
import type { ApplicationStatus, UserLabel } from '@job-search-facilitator/core'
import { computed } from 'vue'

const props = withDefaults(
    defineProps<{
        applicationStatus: ApplicationStatus
        userLabel: UserLabel | null
        compact?: boolean
    }>(),
    {
        compact: false,
    },
)

const applied = computed(() => props.applicationStatus === 'awaiting-response')
const label = computed(() => {
    if (applied.value) {
        return 'applied'
    }

    return props.userLabel === 'forgo' ? 'forgone' : props.userLabel
})
</script>

<template>
    <span
        v-if="label"
        class="user-label"
        :class="{
            'user-label-compact': compact,
            'user-label-forgo': !applied && userLabel === 'forgo',
            'user-label-applied': applied,
        }"
    >
        {{ label }}
    </span>
</template>

<style scoped lang="scss">
.user-label {
    display: inline-flex;
    width: fit-content;
    gap: $space-1;
    align-items: center;
    padding: $space-1 $space-3;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.75rem;
    background: $color-signal-alpha-12;
    border: 1px solid $color-signal-alpha-32;
    border-radius: $radius-full;

    &-compact {
        padding-inline: $space-2;
        font-size: 0.6875rem;
        border-color: $color-signal-alpha-24;
    }

    &-forgo {
        filter: grayscale(1);
        opacity: 0.55;
    }

    &-applied {
        color: $color-ink;
        background: $color-green-600-alpha-25;
        border-color: $color-green-600-alpha-55;
    }
}
</style>
