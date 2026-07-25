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
import SearchReportSelector from '@/components/search-reports/SearchReportSelector.vue'
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

function selectReport(reportId: string) {
    const report = reportStore.reports.find(({ id }) => id === reportId)

    if (report === undefined) {
        return
    }

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
        if (selectedResult.value?.post.id === postId) {
            labelError.value = error instanceof Error ? error.message : 'Could not update label'
        }
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
                <SearchReportSelector
                    :reports="reportStore.reports"
                    :selected-report-id="selectedReport?.id ?? null"
                    :loading="reportStore.loading"
                    :error="reportStore.error"
                    @select="selectReport"
                />
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
                                accessible-label="Filter job posts"
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
</style>
