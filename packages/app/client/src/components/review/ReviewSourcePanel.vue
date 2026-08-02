<script setup lang="ts">
import type { JobSearchReport } from '@job-search-facilitator/core'
import { computed, shallowRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BasePanel from '@/components/base/BasePanel.vue'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    reports: readonly JobSearchReport[]
    selectedReportId: string | null
    userAddedSelected: boolean
    userAddedCount: number
    userAddedLoading: boolean
    userAddedError: string | null
    reportsLoading: boolean
    reportsError: string | null
}>()

const emit = defineEmits<{
    addPost: []
    selectReport: [reportId: string]
    selectUserAdded: []
    retryReports: []
    retryUserAdded: []
}>()

const dateFrom = shallowRef('')
const dateTo = shallowRef('')

const dateFilterActive = computed(() => dateFrom.value !== '' || dateTo.value !== '')
const dateRangeInvalid = computed(
    () => dateFrom.value !== '' && dateTo.value !== '' && dateFrom.value > dateTo.value,
)
const filteredReports = computed(() => {
    if (dateRangeInvalid.value) {
        return []
    }

    return props.reports.filter(
        ({ reportDate }) =>
            (dateFrom.value === '' || reportDate >= dateFrom.value) &&
            (dateTo.value === '' || reportDate <= dateTo.value),
    )
})
const countLabel = computed(() =>
    dateFilterActive.value
        ? `${filteredReports.value.length} of ${props.reports.length} reports`
        : `${props.reports.length} reports`,
)
const userAddedCountLabel = computed(
    () => `${props.userAddedCount} ${props.userAddedCount === 1 ? 'post' : 'posts'}`,
)
const reportTimeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
})
const emptyMessage = computed(() => {
    if (props.reports.length === 0) {
        return 'No search reports found.'
    }

    if (dateRangeInvalid.value) {
        return 'From date must be on or before To date.'
    }

    if (dateFrom.value && dateTo.value) {
        if (dateFrom.value === dateTo.value) {
            return `No reports ran on ${dateFrom.value}.`
        }

        return `No reports ran from ${dateFrom.value} through ${dateTo.value}.`
    }

    if (dateFrom.value) {
        return `No reports ran on or after ${dateFrom.value}.`
    }

    return `No reports ran on or before ${dateTo.value}.`
})

function clearDateFilter() {
    dateFrom.value = ''
    dateTo.value = ''
}

function formatReportTime(report: JobSearchReport) {
    return reportTimeFormatter.format(new Date(report.createdAt))
}
</script>

<template>
    <BasePanel
        class="report-list-panel"
        :active="active"
        :adjacent="adjacent"
        aria-label="Review sources"
        eyebrow="Review sources"
        title="Select a source to review"
    >
        <article class="user-source">
            <BaseCard
                as="div"
                layout="flex"
                interactive
                class="user-source-card"
                :selected="userAddedSelected"
            >
                <button
                    class="user-source-select"
                    data-testid="user-added-source"
                    type="button"
                    :aria-pressed="userAddedSelected"
                    @click="emit('selectUserAdded')"
                >
                    <strong class="source-title">Added by you</strong>
                    <span v-if="userAddedLoading" class="source-count" role="status">Loading…</span>
                    <span v-else class="source-count">{{ userAddedCountLabel }}</span>
                </button>

                <BaseButton
                    class="add-button-tooltip"
                    icon-size="md"
                    preset="primary"
                    tooltip="Add job post"
                    data-testid="add-job-post"
                    aria-label="Add job post"
                    @click="emit('addPost')"
                >
                    <span class="add-button-icon" aria-hidden="true">+</span>
                </BaseButton>
            </BaseCard>

            <div v-if="userAddedError" class="source-error">
                <p class="source-error-message" role="alert">{{ userAddedError }}</p>
                <BaseButton
                    data-testid="review-user-added-retry"
                    preset="text"
                    @click="emit('retryUserAdded')"
                >
                    Retry
                </BaseButton>
            </div>
        </article>

        <div class="report-heading">
            <span class="report-title">Search reports</span>

            <fieldset class="date-filter" aria-label="Filter reports by date">
                <div class="date-fields">
                    <BaseButton
                        class="date-clear"
                        data-testid="review-date-clear"
                        :class="{ 'is-hidden': !dateFilterActive }"
                        preset="text"
                        aria-label="Clear report dates"
                        :disabled="!dateFilterActive"
                        @click="clearDateFilter"
                    >
                        Clear
                    </BaseButton>
                    <input
                        v-model="dateFrom"
                        class="date-input"
                        type="date"
                        data-testid="review-date-from"
                        aria-label="Reports from date"
                        :max="dateTo || undefined"
                        :disabled="reportsLoading || reports.length === 0"
                    />
                    <span class="date-separator" aria-hidden="true">–</span>
                    <input
                        v-model="dateTo"
                        class="date-input"
                        type="date"
                        data-testid="review-date-to"
                        aria-label="Reports through date"
                        :min="dateFrom || undefined"
                        :disabled="reportsLoading || reports.length === 0"
                    />
                </div>
            </fieldset>

            <span class="item-count report-count">{{ countLabel }}</span>
        </div>

        <p v-if="reportsLoading" class="list-message" role="status">Loading search reports…</p>
        <template v-else-if="reportsError">
            <p class="list-message" role="alert">{{ reportsError }}</p>
            <BaseButton
                data-testid="review-report-retry"
                preset="text"
                @click="emit('retryReports')"
            >
                Retry
            </BaseButton>
        </template>
        <ul v-else-if="filteredReports.length" class="card-list" data-testid="report-list">
            <li v-for="report in filteredReports" :key="report.id" class="card-item">
                <BaseCard
                    as="button"
                    class="report-card"
                    :data-testid="`report-card-${report.id}`"
                    :aria-pressed="selectedReportId === report.id"
                    :selected="selectedReportId === report.id"
                    @click="emit('selectReport', report.id)"
                >
                    <span class="report-card-heading">
                        <span>
                            <strong>{{ report.reportDate }} </strong>
                            <small>&nbsp;&nbsp;· {{ formatReportTime(report) }}</small>
                        </span>
                        <span class="report-card-count">{{ report.results.length }} posts</span>
                    </span>
                    <span class="report-card-summary">{{ report.summary }}</span>
                </BaseCard>
            </li>
        </ul>
        <p v-else class="list-message" data-testid="report-empty-state">
            {{ emptyMessage }}
        </p>
    </BasePanel>
</template>

<style scoped lang="scss">
.report-list-panel {
    container-name: report-list;
    container-type: inline-size;
}

.user-source {
    display: grid;
    gap: $space-2;
}

.user-source-card {
    align-items: center;
}

.user-source-select {
    display: grid;
    flex: 1 1 auto;
    gap: $space-1;
    align-self: stretch;
    justify-items: start;
    min-width: 0;
    padding: $space-4;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    background: transparent;
    border: 0;
}

.source-title {
    text-wrap: balance;
}

.source-count,
.source-error-message {
    margin: 0;
    color: $color-ink-muted;
    font-size: 0.8125rem;
}

.source-count {
    white-space: nowrap;
}

.add-button-icon {
    font-size: 1.25rem;
}

.add-button-tooltip {
    flex: 0 0 auto;
    margin-inline: auto $space-4;
}

.source-error {
    display: flex;
    gap: $space-2;
    align-items: baseline;
}

.report-heading {
    display: grid;
    grid-template-areas:
        'count count'
        'title dates';
    grid-template-columns: minmax(0, 1fr) auto;
    gap: $space-2 $space-4;
    align-items: end;
}

.report-title {
    grid-area: title;
    color: $color-ink-secondary;
    font-weight: 650;
    white-space: nowrap;
}

.date-filter {
    grid-area: dates;
    justify-self: end;
    width: min(100%, 21rem);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

.date-fields {
    display: flex;
    gap: $space-2;
    align-items: center;
}

.date-separator {
    flex: 0 0 auto;
    color: $color-ink-muted;
}

.date-input {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    min-height: 2rem;
    padding: $space-1 $space-2;
    color: $color-ink;
    font: inherit;
    font-size: 0.6875rem;
    color-scheme: dark;
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-sm;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    &:focus-visible,
    &:hover:not(:disabled) {
        border-color: $color-signal-light-alpha-50;
    }
}

.date-clear {
    flex: 0 0 auto;
    padding: $space-1 0;
    font-size: 0.75rem;

    &.is-hidden {
        visibility: hidden;
    }
}

.item-count {
    flex: 0 0 auto;
    color: $color-ink-secondary;
    font-size: 0.75rem;
}

.report-count {
    grid-area: count;
    justify-self: end;
}

.report-card {
    gap: $space-1;
    padding: $space-3 $space-4;
}

.report-card-heading {
    display: flex;
    gap: $space-3;
    justify-content: space-between;
}

.report-card-count,
.report-card-summary {
    color: $color-ink-muted;
}

.report-card-count {
    font-size: 0.8125rem;
    white-space: nowrap;
}

.report-card-summary {
    display: -webkit-box;
    overflow: hidden;
    font-size: 0.875rem;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

@container report-list (max-width: 29rem) {
    .report-heading {
        grid-template-areas:
            'title count'
            'dates dates';
    }
}

@container report-list (max-width: 24rem) {
    .date-filter {
        width: 100%;
    }
}

.card-list {
    display: flex;
    flex: 1 0 0;
    flex-direction: column;
    gap: $space-3;
    margin: 0;
    padding: 0 0 $space-5;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
}

.card-item {
    min-width: 0;
}

.list-message {
    color: $color-ink-muted;
}
</style>
