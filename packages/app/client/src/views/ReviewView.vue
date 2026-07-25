<script setup lang="ts">
import type { JobSearchReport, JobSearchResult, UserLabel } from '@job-search-facilitator/core'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDropdown, { type AppDropdownOption } from '@/components/app/AppDropdown.vue'
import { useBreakpoints } from '@/composables/useBreakpoints'
import JobPostList from '@/components/job-posts/JobPostList.vue'
import JobPostViewer, { type JobPostViewerMode } from '@/components/job-posts/JobPostViewer.vue'
import FlowPanel from '@/components/layout/FlowPanel.vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import PanelHeading from '@/components/layout/PanelHeading.vue'
import SearchReportCard from '@/components/search-reports/SearchReportCard.vue'
import { useReportStore } from '@/stores/report.store'
import { usePostStore } from '@/stores/post.store'

type ActivePanel = 'reports' | 'posts' | 'viewer'
type PostFilter = 'all' | 'labeled' | 'unreviewed' | 'forgone'

const postFilterOptions: AppDropdownOption[] = [
    { value: 'all', label: 'All' },
    { value: 'labeled', label: 'Labeled' },
    { value: 'unreviewed', label: 'Unreviewed' },
    { value: 'forgone', label: 'Forgone', tone: 'muted' },
]
const isPostFilter = (value: string): value is PostFilter =>
    postFilterOptions.some((option) => option.value === value)

const bp = useBreakpoints()
const route = useRoute()
const router = useRouter()

const reportStore = useReportStore()
const postStore = usePostStore()
const activePanel = shallowRef<ActivePanel>('reports')
const postFilter = shallowRef<PostFilter>('all')
const reportDateFrom = shallowRef('')
const reportDateTo = shallowRef('')
const selectedReport = shallowRef<JobSearchReport | null>(null)
const selectedResult = shallowRef<JobSearchResult | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)
const reportsLoaded = shallowRef(false)
const reviewViewerMode = { kind: 'review' } satisfies JobPostViewerMode

const getQueryId = (value: (typeof route.query)[string] | undefined) =>
    typeof value === 'string' ? value : null

const getHistoryId = (key: 'reviewReportId' | 'reviewPostId') => {
    const value = router.options.history.state[key]
    return typeof value === 'string' ? value : null
}

function getVisibleQuery() {
    const query = { ...route.query }
    delete query.reportId
    delete query.postId

    return query
}

function pushSelectionState(reportId?: string, postId?: string, replace = false) {
    const state: Record<string, string> = {}

    if (reportId !== undefined) {
        state.reviewReportId = reportId
    }

    if (postId !== undefined) {
        state.reviewPostId = postId
    }

    void router.push({
        path: route.path,
        query: getVisibleQuery(),
        hash: route.hash,
        force: true,
        replace,
        state,
    })
}

function restoreRouteSelection() {
    const stateReportId = getHistoryId('reviewReportId')
    const statePostId = getHistoryId('reviewPostId')
    const hasSelectionState = stateReportId !== null || statePostId !== null
    const reportId = hasSelectionState ? stateReportId : getQueryId(route.query.reportId)
    const postId = hasSelectionState ? statePostId : getQueryId(route.query.postId)
    const requestedReport = reportStore.reports.find(({ id }) => id === reportId)
    const report = requestedReport ?? reportStore.reports[0] ?? null
    const result = requestedReport?.results.find(({ post }) => post.id === postId) ?? null
    const validReportId = requestedReport?.id
    const validPostId = result?.post.id

    selectedReport.value = report
    selectedResult.value = result

    if (
        route.query.reportId !== undefined ||
        route.query.postId !== undefined ||
        stateReportId !== (validReportId ?? null) ||
        statePostId !== (validPostId ?? null)
    ) {
        pushSelectionState(validReportId, validPostId, true)
    }

    if (result !== null) {
        activePanel.value = 'viewer'
    } else if (requestedReport !== undefined) {
        activePanel.value = bp.isLaptop.value ? 'reports' : 'posts'
    } else {
        activePanel.value = 'reports'
    }
}

const filteredResults = computed(() => {
    const results = selectedReport.value?.results ?? []

    if (postFilter.value === 'labeled') {
        return results.filter(({ post }) => post.userLabel !== null && post.userLabel !== 'forgo')
    }

    if (postFilter.value === 'unreviewed') {
        return results.filter(({ post }) => post.userLabel === null)
    }

    if (postFilter.value === 'forgone') {
        return results.filter(({ post }) => post.userLabel === 'forgo')
    }

    return results
})

const reportDateFilterActive = computed(
    () => reportDateFrom.value !== '' || reportDateTo.value !== '',
)
const reportDateRangeInvalid = computed(
    () =>
        reportDateFrom.value !== '' &&
        reportDateTo.value !== '' &&
        reportDateFrom.value > reportDateTo.value,
)
const filteredReports = computed(() => {
    if (reportDateRangeInvalid.value) {
        return []
    }

    return reportStore.reports.filter(
        ({ reportDate }) =>
            (reportDateFrom.value === '' || reportDate >= reportDateFrom.value) &&
            (reportDateTo.value === '' || reportDate <= reportDateTo.value),
    )
})
const reportCountLabel = computed(() => {
    const total = reportStore.reports.length

    return reportDateFilterActive.value
        ? `${filteredReports.value.length} of ${total} reports`
        : `${total} reports`
})
const reportListEmptyMessage = computed(() => {
    if (reportStore.reports.length === 0) {
        return 'No search reports found.'
    }

    if (reportDateRangeInvalid.value) {
        return 'From date must be on or before To date.'
    }

    if (reportDateFrom.value && reportDateTo.value) {
        if (reportDateFrom.value === reportDateTo.value) {
            return `No reports ran on ${reportDateFrom.value}.`
        }

        return `No reports ran from ${reportDateFrom.value} through ${reportDateTo.value}.`
    }

    if (reportDateFrom.value) {
        return `No reports ran on or after ${reportDateFrom.value}.`
    }

    return `No reports ran on or before ${reportDateTo.value}.`
})
const postCountLabel = computed(() => {
    const total = selectedReport.value?.results.length ?? 0

    return postFilter.value === 'all'
        ? `${total} posts`
        : `${filteredResults.value.length} of ${total} posts`
})
const postFilterLabel = computed(
    () => postFilterOptions.find(({ value }) => value === postFilter.value)?.label ?? 'All',
)

const filteredPosts = computed(() => filteredResults.value.map(({ post }) => post))
const postListEmptyMessage = computed(() => {
    if (selectedReport.value?.results.length) {
        return 'No job posts match this filter.'
    }

    return selectedReport.value === null
        ? 'Select a search report.'
        : 'This report has no job posts.'
})

watch(filteredResults, (results) => {
    const selectedPostId = selectedResult.value?.post.id

    if (selectedPostId !== undefined && results.some(({ post }) => post.id === selectedPostId)) {
        return
    }

    if (selectedResult.value === null && activePanel.value === 'viewer') {
        activePanel.value = 'posts'
    }
})

watch(bp.isLaptop, () => {
    if (reportsLoaded.value) {
        restoreRouteSelection()
    }
})

const removeRouteListener = router.afterEach(() => {
    if (reportsLoaded.value) {
        restoreRouteSelection()
    }
})

onUnmounted(removeRouteListener)

function selectReport(report: JobSearchReport) {
    selectedReport.value = report
    postFilter.value = 'all'
    labelError.value = null

    if (!bp.isLaptop.value) {
        activePanel.value = 'posts'
    }

    pushSelectionState(report.id)
}

function selectResult(result: JobSearchResult) {
    selectedResult.value = result
    labelError.value = null
    activePanel.value = 'viewer'

    if (selectedReport.value !== null) {
        pushSelectionState(selectedReport.value.id, result.post.id)
    }
}

function selectPost(postId: string) {
    const result = filteredResults.value.find(({ post }) => post.id === postId)

    if (result !== undefined) {
        selectResult(result)
    }
}

function selectPostFilter(value: string) {
    if (isPostFilter(value)) {
        postFilter.value = value
    }
}

function clearReportDateFilter() {
    reportDateFrom.value = ''
    reportDateTo.value = ''
}

function showReports() {
    activePanel.value = 'reports'
    selectedResult.value = null
    pushSelectionState()
}

function showPosts() {
    activePanel.value = 'posts'

    if (selectedReport.value !== null) {
        pushSelectionState(selectedReport.value.id)
    }
}

async function updateUserLabel(userLabel: UserLabel | null) {
    const postId = selectedResult.value?.post.id

    if (postId === undefined || labelUpdating.value) {
        return
    }

    labelUpdating.value = true
    labelError.value = null

    try {
        await postStore.updatePost(postId, { userLabel })
    } catch (error) {
        labelError.value = error instanceof Error ? error.message : 'Could not update label'
    } finally {
        labelUpdating.value = false
    }
}

onMounted(() => {
    void reportStore
        .fetchReports()
        .then(() => {
            reportsLoaded.value = true
            restoreRouteSelection()
        })
        .catch(() => undefined)
})
</script>

<template>
    <section class="layout-draft" aria-label="Job search review">
        <div class="layout-panels">
            <FlowPanel
                class="report-list-panel glass-frame"
                :active="activePanel === 'reports'"
                :adjacent="false"
                aria-label="Search reports"
            >
                <div class="report-list-heading">
                    <PanelHeading
                        class="report-list-title"
                        eyebrow="Job Search reports"
                        title="Select report to review"
                    />

                    <fieldset class="report-date-filter" aria-label="Filter reports by date">
                        <div class="report-date-fields">
                            <input
                                v-model="reportDateFrom"
                                class="report-date-input"
                                type="date"
                                data-testid="review-date-from"
                                aria-label="Reports from date"
                                :max="reportDateTo || undefined"
                                :disabled="reportStore.loading || reportStore.reports.length === 0"
                            />
                            <span class="report-date-separator" aria-hidden="true">–</span>
                            <input
                                v-model="reportDateTo"
                                class="report-date-input"
                                type="date"
                                data-testid="review-date-to"
                                aria-label="Reports through date"
                                :min="reportDateFrom || undefined"
                                :disabled="reportStore.loading || reportStore.reports.length === 0"
                            />
                            <button
                                class="report-date-clear"
                                data-testid="review-date-clear"
                                :class="{ 'is-hidden': !reportDateFilterActive }"
                                type="button"
                                aria-label="Clear report dates"
                                :disabled="!reportDateFilterActive"
                                @click="clearReportDateFilter"
                            >
                                Clear
                            </button>
                        </div>
                    </fieldset>

                    <span class="item-count report-count">{{ reportCountLabel }}</span>
                </div>

                <p v-if="reportStore.loading" class="list-message">Loading search reports…</p>
                <p v-else-if="reportStore.error" class="list-message">
                    {{ reportStore.error }}
                </p>
                <ul v-else-if="filteredReports.length" class="card-list" data-testid="report-list">
                    <li v-for="report in filteredReports" :key="report.id">
                        <SearchReportCard
                            :report="report"
                            :selected="selectedReport?.id === report.id"
                            @select="selectReport(report)"
                        />
                    </li>
                </ul>
                <p v-else class="list-message" data-testid="report-empty-state">
                    {{ reportListEmptyMessage }}
                </p>
            </FlowPanel>

            <FlowPanel
                class="glass-frame"
                :active="activePanel === 'posts'"
                :adjacent="activePanel === 'reports' || activePanel === 'viewer'"
                aria-label="Job posts"
            >
                <PanelHeading
                    eyebrow="Job posts"
                    :title="selectedReport?.reportDate ?? 'Select a search report'"
                    :back-label="activePanel === 'reports' ? undefined : 'Back to search reports'"
                    back-test-id="back-to-reports"
                    @back="showReports"
                >
                    <template #controls>
                        <span class="item-count">{{ postCountLabel }}</span>

                        <div class="post-filter">
                            <span>Filter</span>
                            <AppDropdown
                                class="post-filter-dropdown"
                                button-label="Filter job posts"
                                test-id="review-post-filter"
                                :disabled="selectedReport === null"
                                :options="postFilterOptions"
                                :label="postFilterLabel"
                                @select="selectPostFilter"
                            />
                        </div>
                    </template>
                </PanelHeading>

                <JobPostList
                    :posts="filteredPosts"
                    :selected-post-id="selectedResult?.post.id ?? null"
                    :empty-message="postListEmptyMessage"
                    @select="selectPost"
                />
            </FlowPanel>

            <FlowPanel
                v-if="selectedResult"
                as="aside"
                class="job-post-view glass-frame"
                :active="activePanel === 'viewer'"
                :adjacent="activePanel === 'posts'"
            >
                <PanelBackButton
                    label="Back to job posts"
                    mobile-only
                    test-id="back-to-job-posts"
                    @back="showPosts"
                />
                <JobPostViewer
                    :post="selectedResult.post"
                    :recommendation="selectedResult"
                    :label-updating="labelUpdating"
                    :label-error="labelError"
                    :mode="reviewViewerMode"
                    @update-label="updateUserLabel"
                />
            </FlowPanel>
        </div>
    </section>
</template>

<style scoped lang="scss">
.layout-draft {
    display: flex;
    flex-direction: column;
    flex: 1;
}

.layout-panels {
    display: flex;
    flex: 1;
    gap: $space-4;
    min-width: 0;
}

.job-post-view {
    flex: 2;
    padding: 1.5rem;
}

.item-count {
    flex: 0 0 auto;
    color: $color-ink-secondary;
    font-size: 0.75rem;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
}

.report-list-panel {
    container-name: report-list;
    container-type: inline-size;
}

.report-list-heading {
    display: grid;
    grid-template-areas:
        'title count'
        'title dates';
    grid-template-columns: minmax(0, 1fr) auto;
    gap: $space-2 $space-4;
    align-items: end;
}

.report-list-title {
    grid-area: title;
}

.report-date-filter {
    grid-area: dates;
    justify-self: end;
    width: min(100%, 21rem);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

.report-date-fields {
    display: flex;
    gap: $space-2;
    align-items: center;
    justify-content: flex-start;
}

.report-date-separator {
    flex: 0 0 auto;
    color: $color-ink-muted;
}

.report-date-input {
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

.report-date-clear {
    flex: 0 0 auto;
    order: -1;
    padding: $space-1 0;
    color: $color-signal-light;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    background: transparent;
    border: 0;

    &.is-hidden {
        visibility: hidden;
    }

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }
}

.report-count {
    grid-area: count;
    justify-self: end;
}

@container report-list (max-width: 38rem) {
    .report-list-heading {
        grid-template-areas:
            'title title'
            'dates count';
        row-gap: $space-4;
    }

    .report-date-filter {
        justify-self: start;
    }

    .report-date-clear {
        order: 0;
    }
}

@container report-list (max-width: 24rem) {
    .report-list-heading {
        grid-template-areas:
            'title'
            'dates'
            'count';
        grid-template-columns: minmax(0, 1fr);
    }

    .report-date-filter {
        width: 100%;
    }
}

.post-filter {
    display: flex;
    gap: $space-3;
    align-items: center;
    color: $color-ink-muted;
    font-size: 0.75rem;

    &-dropdown {
        min-width: 6.5rem;
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

.card-list li {
    min-width: 0;
}

.list-message {
    color: $color-ink-muted;
}
</style>
