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
        :class="{ 'report-card-selected': selected }"
        type="button"
        :aria-pressed="selected"
        @click="emit('select')"
    >
        <span class="report-card-heading">
            <strong>{{ report.reportDate }} · {{ reportTime }}</strong>
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
    background: rgb(245 241 251 / 5%);
    border: 1px solid rgb(245 241 251 / 9%);
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: rgb(173 123 249 / 9%);
        border-color: rgb(173 123 249 / 28%);
    }

    &-selected {
        background: rgb(173 123 249 / 12%);
        border-color: $color-signal !important;
    }
}

.component-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
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
