<script setup lang="ts">
import type { JobSearchReport } from '@job-search-facilitator/core'
import { computed, shallowRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import PanelHeading from '@/components/layout/PanelHeading.vue'
import SearchReportCard from '@/components/search-reports/SearchReportCard.vue'
import UserAddedSourceCard from './UserAddedSourceCard.vue'

const props = defineProps<{
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
</script>

<template>
    <PanelHeading eyebrow="Review sources" title="Select a source to review" />

    <UserAddedSourceCard
        :count="userAddedCount"
        :selected="userAddedSelected"
        :loading="userAddedLoading"
        :error="userAddedError"
        @add="emit('addPost')"
        @select="emit('selectUserAdded')"
        @retry="emit('retryUserAdded')"
    />

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
        <BaseButton data-testid="review-report-retry" preset="text" @click="emit('retryReports')">
            Retry
        </BaseButton>
    </template>
    <ul v-else-if="filteredReports.length" class="card-list" data-testid="report-list">
        <li v-for="report in filteredReports" :key="report.id" class="card-item">
            <SearchReportCard
                :report="report"
                :selected="selectedReportId === report.id"
                @select="emit('selectReport', report.id)"
            />
        </li>
    </ul>
    <p v-else class="list-message" data-testid="report-empty-state">
        {{ emptyMessage }}
    </p>
</template>

<style scoped lang="scss">
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
