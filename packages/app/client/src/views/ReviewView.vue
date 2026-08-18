<script setup lang="ts">
import {
    type JobPost,
    type JobSearchReport,
    type StandaloneJobRecommendation,
    type UserAddedJobPost,
    type UserLabel,
} from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'
import { useBreakpoints } from '@/composables/useBreakpoints'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import JobPostViewPanel, {
    type JobPostViewPanelMode,
} from '@/components/job-posts/JobPostViewPanel.vue'
import JobPostImportPanel from '@/components/review/JobPostImportPanel.vue'
import ReviewSourcePanel from '@/components/review/ReviewSourcePanel.vue'
import { readSessionStorage, writeSessionStorage } from '@/services/session-storage'
import { useJobPostImportStore } from '@/stores/job-post-import'
import { useReportStore } from '@/stores/report'
import { usePostStore } from '@/stores/post'

type ActivePanel = 'sources' | 'posts' | 'viewer' | 'import'
type PostFilter = 'all' | 'labeled' | 'unreviewed' | 'forgone'
type ReviewSource = { kind: 'report'; reportId: string } | { kind: 'user-added' }

const postFilterStorageKey = 'job-search-facilitator:review-post-filter'

interface ReviewItem {
    post: JobPost
    description: string | null
    recommendation: StandaloneJobRecommendation
}

type ReviewSourceItem = JobSearchReport['results'][number] | UserAddedJobPost

const toReviewItem = (item: ReviewSourceItem): ReviewItem => ({
    post: item.post,
    description: item.jobPostSnapshot?.description ?? null,
    recommendation: item,
})

const postFilterOptions: BaseDropdownOption[] = [
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
const importStore = useJobPostImportStore()
const {
    hasSession: hasImportSession,
    taskId: importTaskId,
    dialogOpen: importDialogOpen,
    url: addPostUrl,
    importedItem,
    saving: importSaving,
    starting: importStarting,
    running: importRunning,
    displayIssue: importDisplayIssue,
    retryAvailable: importRetryAvailable,
    showCard: showImportCard,
    popupError: importPopUpError,
    cancelling: importCancelling,
    requestStarting: importRequestStarting,
} = storeToRefs(importStore)
const activePanel = shallowRef<ActivePanel>(hasImportSession.value ? 'import' : 'sources')
const storedPostFilter = readSessionStorage(postFilterStorageKey)
const postFilter = shallowRef<PostFilter>(
    storedPostFilter !== null && isPostFilter(storedPostFilter) ? storedPostFilter : 'all',
)
const selectedSource = shallowRef<ReviewSource | null>(null)
const selectedItem = shallowRef<ReviewItem | null>(null)
const labelUpdating = shallowRef(false)
const postRemoving = shallowRef(false)
const labelError = shallowRef<string | null>(null)
const reportsSettled = shallowRef(false)
const userAddedPostsSettled = shallowRef(false)
const userAddedLoading = shallowRef(false)
const userAddedError = shallowRef<string | null>(null)
let selectionNavigationPending = false
let selectionNavigationRevision = 0
const reviewViewerMode = { kind: 'review' } satisfies JobPostViewPanelMode

const selectedReport = computed(() => {
    const source = selectedSource.value

    return source?.kind === 'report'
        ? (reportStore.reports.find(({ id }) => id === source.reportId) ?? null)
        : null
})
const selectedItems = computed<ReviewItem[]>(() => {
    if (selectedSource.value?.kind === 'user-added') {
        return postStore.userAddedPosts.map(toReviewItem)
    }

    return (selectedReport.value?.results ?? []).map(toReviewItem)
})
const getQueryId = (value: (typeof route.query)[string] | undefined) =>
    typeof value === 'string' ? value : null

const getHistoryId = (key: 'reviewReportId' | 'reviewPostId') => {
    const value = router.options.history.state[key]
    return typeof value === 'string' ? value : null
}

const getHistoryCollection = () =>
    router.options.history.state.reviewCollection === 'user-added' ? 'user-added' : null

function getVisibleQuery() {
    const query = { ...route.query }
    delete query.reportId
    delete query.postId

    return query
}

function pushSelectionState(source?: ReviewSource, postId?: string, replace = false) {
    const state: Record<string, string> = {}
    const navigationRevision = ++selectionNavigationRevision

    if (source?.kind === 'report') {
        state.reviewReportId = source.reportId
    } else if (source?.kind === 'user-added') {
        state.reviewCollection = 'user-added'
    }

    if (postId !== undefined) {
        state.reviewPostId = postId
    }

    selectionNavigationPending = true

    const finishNavigation = () => {
        if (navigationRevision !== selectionNavigationRevision) {
            return
        }

        selectionNavigationPending = false
    }

    void router
        .push({
            path: route.path,
            query: getVisibleQuery(),
            hash: route.hash,
            force: true,
            replace,
            state,
        })
        .then(finishNavigation, finishNavigation)
}

function restoreRouteSelection() {
    if (activePanel.value === 'import' || selectionNavigationPending) {
        return
    }

    const previousPostId = selectedItem.value?.post.id ?? null
    const stateCollection = getHistoryCollection()

    if (
        (stateCollection === 'user-added' && !userAddedPostsSettled.value) ||
        (stateCollection === null && !reportsSettled.value)
    ) {
        return
    }

    const stateReportId = getHistoryId('reviewReportId')
    const statePostId = getHistoryId('reviewPostId')
    const hasSelectionState =
        stateCollection !== null || stateReportId !== null || statePostId !== null
    const reportId = hasSelectionState ? stateReportId : getQueryId(route.query.reportId)
    const postId = hasSelectionState ? statePostId : getQueryId(route.query.postId)
    const requestedReport = reportStore.reports.find(({ id }) => id === reportId)
    const fallbackReport = requestedReport ?? reportStore.reports[0] ?? null
    const source: ReviewSource | null =
        stateCollection === 'user-added'
            ? { kind: 'user-added' }
            : fallbackReport === null
              ? null
              : { kind: 'report', reportId: fallbackReport.id }
    const item =
        stateCollection === 'user-added'
            ? (selectedItemsForUserAdded().find(({ post }) => post.id === postId) ?? null)
            : requestedReport === undefined
              ? null
              : (toReviewItems(requestedReport).find(({ post }) => post.id === postId) ?? null)
    const validSource =
        stateCollection === 'user-added'
            ? ({ kind: 'user-added' } satisfies ReviewSource)
            : requestedReport === undefined
              ? undefined
              : ({ kind: 'report', reportId: requestedReport.id } satisfies ReviewSource)
    const validPostId = item?.post.id

    selectedSource.value = source
    selectedItem.value = item

    if (previousPostId !== (item?.post.id ?? null)) {
        labelError.value = null
    }

    if (
        route.query.reportId !== undefined ||
        route.query.postId !== undefined ||
        stateCollection !== (validSource?.kind === 'user-added' ? 'user-added' : null) ||
        stateReportId !== (validSource?.kind === 'report' ? validSource.reportId : null) ||
        statePostId !== (validPostId ?? null)
    ) {
        pushSelectionState(validSource, validPostId, true)
    }

    if (item !== null) {
        activePanel.value = 'viewer'
    } else if (validSource !== undefined) {
        activePanel.value = bp.isLaptop.value ? 'sources' : 'posts'
    } else {
        activePanel.value = 'sources'
    }
}

const toReviewItems = (report: JobSearchReport): ReviewItem[] => report.results.map(toReviewItem)

const selectedItemsForUserAdded = (): ReviewItem[] => postStore.userAddedPosts.map(toReviewItem)

const filteredItems = computed(() => {
    const items = selectedItems.value

    if (postFilter.value === 'labeled') {
        return items.filter(({ post }) => post.userLabel !== null && post.userLabel !== 'forgo')
    }

    if (postFilter.value === 'unreviewed') {
        return items.filter(({ post }) => post.userLabel === null)
    }

    if (postFilter.value === 'forgone') {
        return items.filter(({ post }) => post.userLabel === 'forgo')
    }

    return items
})

const postCountLabel = computed(() => {
    const total = selectedItems.value.length

    return postFilter.value === 'all'
        ? `${total} posts`
        : `${filteredItems.value.length} of ${total} posts`
})
const postFilterLabel = computed(
    () => postFilterOptions.find(({ value }) => value === postFilter.value)?.label ?? 'All',
)

const filteredPosts = computed(() => filteredItems.value.map(({ post }) => post))
const selectedSourceTitle = computed(() =>
    selectedSource.value?.kind === 'user-added'
        ? 'Added by you'
        : (selectedReport.value?.reportDate ?? 'Select a review source'),
)
const postListEmptyMessage = computed(() => {
    if (selectedItems.value.length) {
        return 'No job posts match this filter.'
    }

    if (selectedSource.value?.kind === 'user-added') {
        return 'You have not added any job posts yet.'
    }

    return selectedReport.value === null
        ? 'Select a review source.'
        : 'This report has no job posts.'
})
const postListLoading = computed(
    () => selectedSource.value?.kind === 'user-added' && userAddedLoading.value,
)
const postListError = computed(() =>
    selectedSource.value?.kind === 'user-added' ? userAddedError.value : null,
)

watch(bp.isLaptop, () => {
    restoreRouteSelection()
})
watch(postFilter, (filter) => writeSessionStorage(postFilterStorageKey, filter))

const removeRouteListener = router.afterEach(() => {
    restoreRouteSelection()
})

onUnmounted(() => {
    removeRouteListener()
    selectionNavigationRevision += 1
    selectionNavigationPending = false
})

function selectReport(reportId: string) {
    const report = reportStore.reports.find(({ id }) => id === reportId)

    if (report === undefined) {
        return
    }

    const source = { kind: 'report', reportId: report.id } satisfies ReviewSource
    selectedSource.value = source
    selectedItem.value = null
    labelError.value = null

    if (!bp.isLaptop.value) {
        activePanel.value = 'posts'
    }

    pushSelectionState(source)
}

function selectUserAdded() {
    const source = { kind: 'user-added' } satisfies ReviewSource
    selectedSource.value = source
    selectedItem.value = null
    labelError.value = null

    if (!bp.isLaptop.value) {
        activePanel.value = 'posts'
    }

    pushSelectionState(source)
}

function showImport() {
    importStore.openDialog()
}

function submitImportUrl() {
    if (importStore.submitUrl()) {
        activePanel.value = 'import'
    }
}

function showImportPosts() {
    const source = { kind: 'user-added' } satisfies ReviewSource
    selectedSource.value = source
    selectedItem.value = null
    labelError.value = null
    activePanel.value = bp.isLaptop.value ? 'sources' : 'posts'
    pushSelectionState(source)
}

function showImportProgress() {
    if (hasImportSession.value) {
        activePanel.value = 'import'
    }
}

watch(
    importedItem,
    (savedItem) => {
        if (savedItem === null) {
            return
        }

        const source = { kind: 'user-added' } satisfies ReviewSource
        selectedSource.value = source
        selectedItem.value = {
            post: savedItem.post,
            description: savedItem.jobPostSnapshot?.description ?? null,
            recommendation: savedItem,
        }
        labelError.value = null
        activePanel.value = 'viewer'
        pushSelectionState(source, savedItem.post.id)
        importStore.consumeImportedItem(savedItem)
    },
    { immediate: true },
)

function selectItem(item: ReviewItem) {
    selectedItem.value = item
    labelError.value = null
    activePanel.value = 'viewer'

    if (selectedSource.value !== null) {
        pushSelectionState(selectedSource.value, item.post.id)
    }
}

function selectPost(postId: string) {
    const item = filteredItems.value.find(({ post }) => post.id === postId)

    if (item !== undefined) {
        selectItem(item)
    }
}

function selectPostFilter(value: string) {
    if (isPostFilter(value)) {
        postFilter.value = value
    }
}

function showSources() {
    activePanel.value = 'sources'
    selectedItem.value = null
    pushSelectionState(selectedSource.value ?? undefined)
}

function showPosts() {
    activePanel.value = 'posts'

    if (selectedSource.value !== null) {
        pushSelectionState(selectedSource.value)
    }
}

async function updateUserLabel(userLabel: UserLabel | null) {
    const postId = selectedItem.value?.post.id

    if (postId === undefined || labelUpdating.value) {
        return
    }

    labelUpdating.value = true
    labelError.value = null

    try {
        await postStore.updatePost(postId, { userLabel })
    } catch (error) {
        if (selectedItem.value?.post.id === postId) {
            labelError.value = error instanceof Error ? error.message : 'Could not update label'
        }
    } finally {
        labelUpdating.value = false
    }
}

async function removeUserAddedPost() {
    const postId = selectedItem.value?.post.id

    if (postId === undefined || selectedSource.value?.kind !== 'user-added' || postRemoving.value) {
        return
    }

    postRemoving.value = true
    labelError.value = null

    try {
        await postStore.removeUserAddedPost(postId)
        reportStore.removePost(postId)

        if (selectedItem.value?.post.id === postId) {
            selectedItem.value = null
            activePanel.value = 'posts'
            pushSelectionState(selectedSource.value)
        }
    } catch (error) {
        if (selectedItem.value?.post.id === postId) {
            labelError.value = error instanceof Error ? error.message : 'Could not delete job post'
        }
    } finally {
        postRemoving.value = false
    }
}

async function loadReports() {
    try {
        await reportStore.fetchReports()
    } catch {
        // The report store owns the error rendered by ReviewSourcePanel.
    } finally {
        reportsSettled.value = true
        restoreRouteSelection()
    }
}

async function loadUserAddedPosts() {
    userAddedLoading.value = true
    userAddedError.value = null

    try {
        await postStore.fetchUserAddedPosts()
    } catch (error) {
        userAddedError.value = error instanceof Error ? error.message : 'Could not load job posts'
    } finally {
        userAddedLoading.value = false
        userAddedPostsSettled.value = true
        restoreRouteSelection()
    }
}

onMounted(() => {
    void loadReports()
    void loadUserAddedPosts()

    if (importStore.clearRestoredCancellation() && activePanel.value === 'import') {
        showImportPosts()
    }
})
</script>

<template>
    <section class="review-layout" aria-label="Job search review">
        <BasePopUp
            data-testid="job-post-url-dialog"
            :open="importDialogOpen"
            heading="Add job post"
            close-label="Close add job post"
            close-test-id="close-job-post-url-dialog"
            :error="importPopUpError"
            error-test-id="job-post-url-error"
            @close="importStore.closeDialog"
        >
            <template #default="{ errorId }">
                <form
                    class="url-form"
                    data-testid="job-post-url-form"
                    novalidate
                    @submit.prevent="submitImportUrl"
                >
                    <div class="url-entry">
                        <input
                            id="job-post-url"
                            v-model="addPostUrl"
                            class="url-input"
                            data-testid="job-post-url"
                            type="url"
                            inputmode="url"
                            autocomplete="url"
                            aria-label="Job post URL"
                            placeholder="Job post URL for agent to review"
                            :aria-describedby="importPopUpError ? errorId : undefined"
                            :aria-invalid="importPopUpError !== null"
                            :disabled="importRequestStarting"
                            autofocus
                            @input="importStore.clearUrlError"
                        />
                        <BaseButton
                            class="submit-button"
                            data-testid="start-job-post-import"
                            icon-size="lg"
                            preset="primary"
                            type="submit"
                            aria-label="Add job post"
                            title="Add job post"
                            :disabled="importRequestStarting"
                        >
                            <span aria-hidden="true">→</span>
                        </BaseButton>
                    </div>
                </form>
            </template>
        </BasePopUp>

        <div class="layout-panels">
            <ReviewSourcePanel
                class="report-list-panel glass-frame"
                data-testid="review-sources-panel"
                :active="activePanel === 'sources'"
                :adjacent="activePanel === 'import'"
                :reports="reportStore.reports"
                :selected-report-id="selectedReport?.id ?? null"
                :user-added-selected="selectedSource?.kind === 'user-added'"
                :user-added-count="postStore.userAddedPosts.length"
                :user-added-loading="userAddedLoading"
                :user-added-error="userAddedError"
                :reports-loading="reportStore.loading"
                :reports-error="reportStore.error"
                @add-post="showImport"
                @select-report="selectReport"
                @select-user-added="selectUserAdded"
                @retry-reports="loadReports"
                @retry-user-added="loadUserAddedPosts"
            />

            <JobPostImportPanel
                class="import-panel glass-frame"
                data-testid="review-import-panel"
                :active="activePanel === 'import'"
                :adjacent="false"
                :cancelling="importCancelling"
                :issue="importDisplayIssue"
                :retry-available="importRetryAvailable"
                :running="importRunning"
                :saving="importSaving"
                :starting="importStarting"
                :task-id="importTaskId"
                @back="showImportPosts"
                @cancel="importStore.cancel"
                @retry="importStore.retry"
            />

            <JobPostListPanel
                class="glass-frame"
                data-testid="review-posts-panel"
                :active="activePanel === 'posts'"
                :adjacent="activePanel === 'sources' || activePanel === 'viewer'"
                aria-label="Job posts"
                eyebrow="Job posts"
                :title="selectedSourceTitle"
                :back-label="activePanel === 'sources' ? undefined : 'Back to review sources'"
                back-test-id="back-to-reports"
                :posts="filteredPosts"
                :selected-post-id="selectedItem?.post.id ?? null"
                :empty-message="postListEmptyMessage"
                :loading="postListLoading"
                :error="postListError"
                :pending="selectedSource?.kind === 'user-added' && showImportCard"
                @back="showSources"
                @select="selectPost"
                @select-pending="showImportProgress"
                @retry="loadUserAddedPosts"
            >
                <template #heading-controls>
                    <span class="item-count">{{ postCountLabel }}</span>

                    <div class="post-filter">
                        <span>Filter</span>
                        <BaseDropdown
                            class="post-filter-dropdown"
                            accessible-label="Filter job posts"
                            test-id="review-post-filter"
                            :disabled="selectedSource === null"
                            :options="postFilterOptions"
                            :label="postFilterLabel"
                            @select="selectPostFilter"
                        />
                    </div>
                </template>
            </JobPostListPanel>

            <JobPostViewPanel
                v-if="selectedItem"
                class="job-post-view glass-frame"
                data-testid="review-viewer-panel"
                :active="activePanel === 'viewer'"
                :adjacent="activePanel === 'posts'"
                back-label="Back to job posts"
                back-mobile-only
                :post="selectedItem.post"
                :description="selectedItem.description"
                :recommendation="selectedItem.recommendation"
                :label-updating="labelUpdating || postRemoving"
                :label-error="labelError"
                :removable="selectedSource?.kind === 'user-added'"
                :removing="postRemoving"
                :mode="reviewViewerMode"
                @back="showPosts"
                @remove="removeUserAddedPost"
                @update-label="updateUserLabel"
            />
        </div>
    </section>
</template>

<style scoped lang="scss">
.review-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    max-height: calc(100dvh - ($space-3 * 2));
    min-height: 0;
}

.layout-panels {
    display: flex;
    flex: 1;
    gap: $space-4;
    min-height: 0;
    min-width: 0;
}

.job-post-view {
    flex: 2;
    padding: 1.5rem;
}

.url-form {
    display: grid;
    gap: $space-2;
}

.url-entry {
    display: flex;
    gap: $space-2;
    align-items: center;
}

.url-input {
    flex: 1 1 auto;
    height: 2.75rem;
    min-width: 0;
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;

    &::placeholder {
        color: $color-ink-muted;
    }

    &:focus-visible {
        border-color: $color-signal-light;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }
}

.submit-button {
    flex: 0 0 auto;
    font-size: 1.25rem;

    &:disabled {
        cursor: wait;
    }
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
