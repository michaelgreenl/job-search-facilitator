<script setup lang="ts">
import {
    parseCreateUserAddedJobPostInput,
    type CreateUserAddedJobPostInput,
    type JobPost,
    type JobSearchReport,
    type StandaloneJobRecommendation,
    type UserLabel,
    type WorkTask,
} from '@job-search-facilitator/core'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDropdown, { type AppDropdownOption } from '@/components/app/AppDropdown.vue'
import { useBreakpoints } from '@/composables/useBreakpoints'
import { useWorkTask } from '@/composables/useWorkTask'
import JobPostList from '@/components/job-posts/JobPostList.vue'
import JobPostViewer, { type JobPostViewerMode } from '@/components/job-posts/JobPostViewer.vue'
import FlowPanel from '@/components/layout/FlowPanel.vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import PanelHeading from '@/components/layout/PanelHeading.vue'
import JobPostImportPanel from '@/components/review/JobPostImportPanel.vue'
import JobPostUrlDialog from '@/components/review/JobPostUrlDialog.vue'
import ReviewSourceSelector from '@/components/review/ReviewSourceSelector.vue'
import WorkStream from '@/components/work/WorkStream.vue'
import { useReportStore } from '@/stores/report'
import { usePostStore } from '@/stores/post'
import { createJobPostImportTask } from '@/work-tasks'

type ActivePanel = 'sources' | 'posts' | 'viewer' | 'import'
type PostFilter = 'all' | 'labeled' | 'unreviewed' | 'forgone'
type ReviewSource = { kind: 'report'; reportId: string } | { kind: 'user-added' }

interface ReviewItem {
    post: JobPost
    recommendation: StandaloneJobRecommendation
}

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
const importWork = useWorkTask('job-post-import')
const activePanel = shallowRef<ActivePanel>(
    importWork.session.value === null ? 'sources' : 'import',
)
const postFilter = shallowRef<PostFilter>('all')
const selectedSource = shallowRef<ReviewSource | null>(null)
const selectedItem = shallowRef<ReviewItem | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)
const reportsSettled = shallowRef(false)
const userAddedPostsSettled = shallowRef(false)
const userAddedLoading = shallowRef(false)
const userAddedError = shallowRef<string | null>(null)
const importSaving = shallowRef(false)
const importIssue = shallowRef<string | null>(null)
const importDialogIssue = shallowRef<string | null>(null)
const importingTaskId = shallowRef<string | null>(null)
const importRetryMode = shallowRef<'save' | 'task' | null>(null)
let importRevision = 0
let selectionNavigationPending = false
let selectionNavigationRevision = 0
const reviewViewerMode = { kind: 'review' } satisfies JobPostViewerMode

const selectedReport = computed(() => {
    const source = selectedSource.value

    return source?.kind === 'report'
        ? (reportStore.reports.find(({ id }) => id === source.reportId) ?? null)
        : null
})
const selectedItems = computed<ReviewItem[]>(() => {
    if (selectedSource.value?.kind === 'user-added') {
        return postStore.userAddedPosts.map((item) => ({
            post: item.post,
            recommendation: item,
        }))
    }

    return (selectedReport.value?.results ?? []).map((result) => ({
        post: result.post,
        recommendation: result,
    }))
})
const importSession = computed(() => {
    const session = importWork.session.value
    return session?.kind === 'job-post-import' ? session : null
})
const matchingImportTask = importWork.task
const importStarting = computed(
    () =>
        importSession.value !== null &&
        matchingImportTask.value === null &&
        (importWork.starting.value || importWork.restoring.value),
)
const importRunning = computed(() => matchingImportTask.value?.status === 'running')
const importBusy = computed(() => importWork.taskActive.value || importSaving.value)
const importDisplayIssue = computed(
    () =>
        importIssue.value ??
        (matchingImportTask.value?.status === 'failed' ? matchingImportTask.value.error : null) ??
        (matchingImportTask.value?.status === 'cancelled'
            ? 'The job-post import was cancelled.'
            : null) ??
        (importSession.value !== null ? importWork.error.value : null),
)
const importRetryAvailable = computed(
    () => importSession.value !== null && !importBusy.value && importDisplayIssue.value !== null,
)
const showImportWork = computed(
    () =>
        importSession.value !== null && (importStarting.value || matchingImportTask.value !== null),
)
const showImportCard = computed(
    () =>
        importSession.value !== null &&
        (importStarting.value || importRunning.value || importSaving.value),
)
const addPostUrl = computed({
    get: () => postStore.addPostDialog.url,
    set: (url: string) => postStore.setAddPostUrl(url),
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
        restoreRouteSelection()
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

const toReviewItems = (report: JobSearchReport): ReviewItem[] =>
    report.results.map((result) => ({
        post: result.post,
        recommendation: result,
    }))

const selectedItemsForUserAdded = (): ReviewItem[] =>
    postStore.userAddedPosts.map((item) => ({
        post: item.post,
        recommendation: item,
    }))

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

const removeRouteListener = router.afterEach(() => {
    restoreRouteSelection()
})

onUnmounted(() => {
    removeRouteListener()
    importRevision += 1
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
    postFilter.value = 'all'
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
    postFilter.value = 'all'
    labelError.value = null

    if (!bp.isLaptop.value) {
        activePanel.value = 'posts'
    }

    pushSelectionState(source)
}

function showImport() {
    importDialogIssue.value = null
    postStore.openAddPostDialog()
}

function showImportPosts() {
    const source = { kind: 'user-added' } satisfies ReviewSource
    selectedSource.value = source
    selectedItem.value = null
    postFilter.value = 'all'
    labelError.value = null
    activePanel.value = 'posts'
    pushSelectionState(source)
}

function showImportProgress() {
    if (importSession.value !== null) {
        activePanel.value = 'import'
    }
}

async function saveImportedPost(
    input: CreateUserAddedJobPostInput,
    revision: number,
    taskId: string,
) {
    importSaving.value = true
    importIssue.value = null
    importRetryMode.value = 'save'

    try {
        const savedItem = await postStore.addUserAddedPost(input)

        if (revision !== importRevision || importSession.value?.taskId !== taskId) {
            return
        }

        const source = { kind: 'user-added' } satisfies ReviewSource
        importWork.dismissSession()
        importIssue.value = null
        selectedSource.value = source
        selectedItem.value = {
            post: savedItem.post,
            recommendation: savedItem,
        }
        postFilter.value = 'all'
        labelError.value = null
        activePanel.value = 'viewer'
        pushSelectionState(source, savedItem.post.id)
    } catch (error) {
        if (revision === importRevision && importSession.value?.taskId === taskId) {
            importIssue.value =
                error instanceof Error ? error.message : 'Could not save the imported job post'
        }
    } finally {
        if (revision === importRevision) {
            importSaving.value = false
        }
    }
}

async function handleImportTask(task: WorkTask, revision = importRevision) {
    if (
        revision !== importRevision ||
        task.id !== importSession.value?.taskId ||
        importingTaskId.value === task.id
    ) {
        return
    }

    if (task.status === 'running') {
        return
    }

    if (task.status === 'failed') {
        importIssue.value = task.error
        importRetryMode.value = 'task'
        return
    }

    if (task.status === 'cancelled') {
        importIssue.value = 'The job-post import was cancelled.'
        importRetryMode.value = 'task'
        return
    }

    importingTaskId.value = task.id

    try {
        const input = parseCreateUserAddedJobPostInput(task.output)
        await saveImportedPost(input, revision, task.id)
    } catch {
        if (revision === importRevision && importSession.value?.taskId === task.id) {
            importIssue.value = 'Work did not return a valid job post. Try again.'
            importRetryMode.value = 'task'
        }
    } finally {
        if (importingTaskId.value === task.id) {
            importingTaskId.value = null
        }
    }
}

async function startImport(url: string) {
    if (importBusy.value) {
        importDialogIssue.value = 'Finish the current job-post import before starting another.'
        return
    }

    const revision = ++importRevision
    importIssue.value = null
    importDialogIssue.value = null
    importRetryMode.value = null
    postStore.closeAddPostDialog()
    activePanel.value = 'import'

    try {
        const task = await importWork.startTask(createJobPostImportTask(url), {
            kind: 'job-post-import',
            url,
        })

        postStore.clearAddPostDialog()
        await handleImportTask(task, revision)
    } catch (error) {
        if (revision === importRevision && importSession.value !== null) {
            importIssue.value =
                error instanceof Error ? error.message : 'Could not start the job-post import'
            importRetryMode.value = 'task'
        }
    }
}

function retryImport() {
    const session = importSession.value
    const task = matchingImportTask.value

    if (session === null) {
        return
    }

    if (task?.status === 'completed' && importRetryMode.value === 'save') {
        void handleImportTask(task)
    } else {
        void startImport(session.url)
    }
}

async function cancelImport() {
    if (importRunning.value) {
        try {
            await importWork.cancelTask()
        } catch (error) {
            importIssue.value =
                error instanceof Error ? error.message : 'Could not cancel the job-post import'
        }
    }
}

function dismissImport() {
    if (!importWork.dismissSession()) {
        return
    }

    importRevision += 1
    importIssue.value = null
    importingTaskId.value = null
    importRetryMode.value = null
    showSources()
}

watch(
    [importSession, matchingImportTask] as const,
    ([session, task]) => {
        if (session?.kind !== 'job-post-import') {
            return
        }

        activePanel.value = 'import'
        postStore.clearAddPostDialog()

        if (task?.id === session.taskId) {
            void handleImportTask(task)
        }
    },
    { immediate: true },
)

watch(
    () => postStore.addPostDialog.open,
    (open) => {
        if (!open) {
            importDialogIssue.value = null
        }
    },
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
    pushSelectionState()
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

async function loadReports() {
    try {
        await reportStore.fetchReports()
    } catch {
        // The report store owns the error rendered by ReviewSourceSelector.
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

    if (importSession.value !== null) {
        void importWork.restoreSession().catch(() => undefined)
    }
})
</script>

<template>
    <section class="layout-draft" aria-label="Job search review">
        <JobPostUrlDialog
            v-model:url="addPostUrl"
            :open="postStore.addPostDialog.open"
            :busy="importWork.starting.value"
            :issue="importDialogIssue"
            @close="postStore.closeAddPostDialog"
            @submit="startImport"
        />

        <div class="layout-panels">
            <FlowPanel
                class="report-list-panel glass-frame"
                :active="activePanel === 'sources'"
                :adjacent="activePanel === 'import'"
                aria-label="Review sources"
            >
                <ReviewSourceSelector
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
            </FlowPanel>

            <FlowPanel
                class="import-panel glass-frame"
                :active="activePanel === 'import'"
                :adjacent="false"
                aria-label="Add job post"
            >
                <JobPostImportPanel
                    v-if="activePanel === 'import'"
                    :back-available="importRunning || importSaving"
                    :can-dismiss="importWork.canDismissSession.value"
                    :cancelling="importWork.cancelling.value"
                    :issue="importDisplayIssue"
                    :retry-available="importRetryAvailable"
                    :running="importRunning"
                    :saving="importSaving"
                    :starting="importStarting"
                    @back="showImportPosts"
                    @cancel="cancelImport"
                    @dismiss="dismissImport"
                    @retry="retryImport"
                >
                    <WorkStream v-if="showImportWork" lane="job-post-import" :issue="null" />
                </JobPostImportPanel>
            </FlowPanel>

            <FlowPanel
                class="glass-frame"
                :active="activePanel === 'posts'"
                :adjacent="activePanel === 'sources' || activePanel === 'viewer'"
                aria-label="Job posts"
            >
                <PanelHeading
                    eyebrow="Job posts"
                    :title="selectedSourceTitle"
                    :back-label="activePanel === 'sources' ? undefined : 'Back to review sources'"
                    back-test-id="back-to-reports"
                    @back="showSources"
                >
                    <template #controls>
                        <span class="item-count">{{ postCountLabel }}</span>

                        <div class="post-filter">
                            <span>Filter</span>
                            <AppDropdown
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
                </PanelHeading>

                <JobPostList
                    :posts="filteredPosts"
                    :selected-post-id="selectedItem?.post.id ?? null"
                    :empty-message="postListEmptyMessage"
                    :loading="postListLoading"
                    :error="postListError"
                    :pending="selectedSource?.kind === 'user-added' && showImportCard"
                    @select="selectPost"
                    @select-pending="showImportProgress"
                    @retry="loadUserAddedPosts"
                />
            </FlowPanel>

            <FlowPanel
                v-if="selectedItem"
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
                    :post="selectedItem.post"
                    :recommendation="selectedItem.recommendation"
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

.import-panel {
    overflow: hidden;
    padding-bottom: $space-5;
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
