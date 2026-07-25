<script setup lang="ts">
import type { JobSearchReport } from '@job-search-facilitator/core'
import { computed } from 'vue'

const props = defineProps<{
    report: JobSearchReport
    selected: boolean
}>()

const emit = defineEmits<{
    select: []
}>()

const reportTime = computed(() =>
    new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(props.report.createdAt)),
)
</script>

<template>
    <button
        class="report-card"
        :data-testid="`report-card-${report.id}`"
        :class="{ 'report-card-selected': selected }"
        type="button"
        :aria-pressed="selected"
        @click="emit('select')"
    >
        <span class="report-card-heading">
            <span>
                <strong>{{ report.reportDate }} </strong>
                <small>&nbsp;&nbsp;· {{ reportTime }}</small>
            </span>
            <span class="report-count">{{ report.results.length }} posts</span>
        </span>
        <span class="report-summary">{{ report.summary }}</span>
    </button>
</template>

<style scoped lang="scss">
.report-card {
    display: grid;
    gap: $space-1;
    width: 100%;
    padding: $space-3 $space-4;
    color: $color-ink;
    font: inherit;
    text-align: start;
    cursor: pointer;
    background: $color-ink-alpha-5;
    border: 1px solid $color-ink-alpha-9;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal-alpha-9;
        border-color: $color-signal-alpha-28;
    }

    &-selected {
        background: $color-signal-alpha-12;
        border-color: $color-signal !important;
    }
}

.report-card-heading {
    display: flex;
    gap: $space-3;
    justify-content: space-between;
}

.report-count,
.report-summary {
    color: $color-ink-muted;
}

.report-count {
    font-size: 0.8125rem;
    white-space: nowrap;
}

.report-summary {
    display: -webkit-box;
    overflow: hidden;
    font-size: 0.875rem;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}
</style>
