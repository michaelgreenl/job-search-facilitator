<script setup lang="ts">
import type { ApplicationStatus, UserLabel } from '@job-search-facilitator/core'
import { computed } from 'vue'
import { APPLICATION_STATUS_LABELS, getUserLabelTone } from './job-post-labels'

const props = withDefaults(
    defineProps<{
        applicationStatus: ApplicationStatus
        userLabel: UserLabel | null
        compact?: boolean
        showApplicationStatus?: boolean
        showOutreachResponse?: boolean
    }>(),
    {
        compact: false,
        showApplicationStatus: false,
        showOutreachResponse: false,
    },
)

const applied = computed(() => props.applicationStatus !== 'not-applied')
const label = computed(() => {
    if (props.showApplicationStatus) {
        return APPLICATION_STATUS_LABELS[props.applicationStatus]
    }

    if (applied.value) {
        return 'applied'
    }

    return props.userLabel === 'forgo' ? 'forgone' : props.userLabel
})
const tone = computed(() => {
    if (
        props.showApplicationStatus &&
        ['not-applied', 'awaiting-response', 'rejected'].includes(props.applicationStatus)
    ) {
        return 'muted'
    }

    if (applied.value) {
        return 'success'
    }

    return props.userLabel === null ? null : getUserLabelTone(props.userLabel)
})
</script>

<template>
    <span v-if="label || showOutreachResponse" class="job-post-labels">
        <span
            v-if="label"
            class="user-label"
            data-testid="job-post-label"
            :class="[{ 'user-label-compact': compact }, tone && `user-label-${tone}`]"
        >
            {{ label }}
        </span>
        <span
            v-if="showOutreachResponse"
            class="user-label user-label-success"
            data-testid="outreach-response-label"
            :class="{ 'user-label-compact': compact }"
        >
            Outreach response
        </span>
    </span>
</template>

<style scoped lang="scss">
.job-post-labels {
    display: inline-flex;
    flex-direction: column;
    gap: $space-1;
    align-items: flex-end;
}

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

    &-priority-high {
        color: lighten-color($color-red-600, 25%);
        background: $color-red-600-alpha-14;
        border-color: lighten-color($color-red-600, 25%);
    }

    &-priority-medium {
        color: $color-amber-500;
        background: $color-amber-500-alpha-12;
        border-color: $color-amber-500;
    }

    &-success {
        color: lighten-color($color-green-600, 35%);
        background: $color-green-600-alpha-25;
        border-color: $color-green-600-alpha-55;
    }

    &-muted {
        color: $color-ink-muted;
        background: transparent;
        border-color: $color-ink-muted;
    }
}
</style>
