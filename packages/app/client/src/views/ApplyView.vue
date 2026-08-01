<script setup lang="ts">
import {
    USER_LABELS,
    type JobPost,
    type JobRecommendationContext,
    type UserLabel,
} from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import JobPostViewPanel, {
    type JobPostViewPanelMode,
} from '@/components/job-posts/JobPostViewPanel.vue'
import { getUserLabelTone } from '@/components/job-posts/job-post-labels'
import OutreachPanel from '@/components/outreach/OutreachPanel.vue'
import { useOutreachStore } from '@/stores/outreach'
import { usePostStore } from '@/stores/post'

type ApplyLabel = Exclude<UserLabel, 'forgo'>
type PostFilter = 'all' | ApplyLabel
type ActivePanel = 'posts' | 'viewer' | 'outreach'

const applyLabels = USER_LABELS.filter((label): label is ApplyLabel => label !== 'forgo')
const postFilterOptions: BaseDropdownOption[] = [
    { value: 'all', label: 'All' },
    ...applyLabels.map((label) => ({
        value: label,
        label,
        tone: getUserLabelTone(label),
    })),
]
const isPostFilter = (value: string): value is PostFilter =>
    value === 'all' || applyLabels.some((label) => label === value)
const postStore = usePostStore()
const outreachStore = useOutreachStore()
const {
    hasTaskSession: hasOutreachTaskSession,
    postId: outreachPostId,
    contact: outreachContact,
    contactSaving,
    contactUpdating,
    contactsLoading,
    taskVisible: outreachTaskVisible,
    restoreContactListPending,
    taskActive: outreachTaskActive,
} = storeToRefs(outreachStore)
const postFilter = shallowRef<PostFilter>('all')
const activePanel = shallowRef<ActivePanel>(
    outreachPostId.value !== null && (outreachTaskVisible.value || restoreContactListPending.value)
        ? 'outreach'
        : 'posts',
)
const outreachExpanded = shallowRef(false)
const selectedPostId = shallowRef<string | null>(outreachPostId.value)
const listLoading = shallowRef(true)
const listError = shallowRef<string | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)
const applicationUpdating = shallowRef(false)
const applicationError = shallowRef<string | null>(null)
const applyQueuePostIds = shallowRef<readonly string[] | null>(null)
const retainedForgoneLabelByPostId = reactive(new Map<string, ApplyLabel>())
const recommendationContextByPostId = shallowRef<
    ReadonlyMap<string, JobRecommendationContext | null>
>(new Map())
let viewMounted = true

onBeforeUnmount(() => {
    viewMounted = false
})

// The route-local snapshot keeps newly applied or forgone posts until this view remounts.
const currentVisitApplyQueue = computed(() =>
    applyQueuePostIds.value === null
        ? []
        : applyQueuePostIds.value.flatMap((postId) => {
              const post = postStore.findPost(postId)
              return post === null ? [] : [post]
          }),
)

const filteredPosts = computed(() =>
    postFilter.value === 'all'
        ? currentVisitApplyQueue.value
        : currentVisitApplyQueue.value.filter(
              ({ id, userLabel }) =>
                  userLabel === postFilter.value ||
                  retainedForgoneLabelByPostId.get(id) === postFilter.value,
          ),
)
const postFilterLabel = computed(
    () => postFilterOptions.find(({ value }) => value === postFilter.value)?.label ?? 'All',
)

const selectedPost = computed(() =>
    selectedPostId.value === null ? null : postStore.findPost(selectedPostId.value),
)
const selectedRecommendationContext = computed(() =>
    selectedPostId.value === null
        ? null
        : (recommendationContextByPostId.value.get(selectedPostId.value) ?? null),
)
const outreachPost = computed(() =>
    outreachPostId.value === null ? null : postStore.findPost(outreachPostId.value),
)
const outreachTaskInProgress = computed(() => outreachTaskActive.value || contactSaving.value)
const outreachActionDisabled = computed(
    () =>
        contactsLoading.value ||
        contactSaving.value ||
        contactUpdating.value ||
        (outreachTaskActive.value && outreachPostId.value !== selectedPostId.value),
)
const applyViewerMode = computed<JobPostViewPanelMode>(() => ({
    kind: 'apply',
    applicationUpdating: applicationUpdating.value || applyQueuePostIds.value === null,
    applicationError: applicationError.value,
    outreachDisabled: outreachActionDisabled.value,
}))

watch(
    filteredPosts,
    (posts) => {
        if (
            posts.some(({ id }) => id === selectedPostId.value) ||
            (activePanel.value === 'outreach' && outreachPostId.value !== null)
        ) {
            return
        }

        const postId = posts[0]?.id ?? null
        const changed = postId !== selectedPostId.value
        selectedPostId.value = postId

        if (changed) {
            if (!outreachTaskInProgress.value) {
                outreachStore.reset()
            }

            outreachExpanded.value = false
            labelError.value = null
            applicationError.value = null
        }

        if (selectedPostId.value === null) {
            activePanel.value = 'posts'
        }
    },
    { immediate: true },
)

function selectPost(postId: string) {
    const changed = postId !== selectedPostId.value
    selectedPostId.value = postId

    if (changed && !outreachTaskInProgress.value) {
        outreachStore.reset()
    }

    outreachExpanded.value = false
    labelError.value = null
    applicationError.value = null
    activePanel.value = 'viewer'
}

function selectPostFilter(value: string) {
    if (isPostFilter(value)) {
        postFilter.value = value
    }
}

function updateApplyQueueMembership(postId: string, inApplyQueue: boolean) {
    if (applyQueuePostIds.value === null) {
        return
    }

    const postIds = applyQueuePostIds.value
    const includesPost = postIds.includes(postId)

    if (inApplyQueue && !includesPost) {
        applyQueuePostIds.value = [...postIds, postId]
    } else if (!inApplyQueue && includesPost) {
        applyQueuePostIds.value = postIds.filter((currentPostId) => currentPostId !== postId)
    }
}

function showPosts() {
    if (!filteredPosts.value.some(({ id }) => id === selectedPostId.value)) {
        selectedPostId.value = filteredPosts.value[0]?.id ?? null

        if (!outreachTaskInProgress.value) {
            outreachStore.reset()
        }
    }

    outreachExpanded.value = false
    activePanel.value = 'posts'
}

function showViewer() {
    if (selectedPost.value === null) {
        showPosts()
        return
    }

    outreachExpanded.value = false
    activePanel.value = 'viewer'
}

async function startContactDiscovery(post: JobPost) {
    if (
        !viewMounted ||
        outreachTaskVisible.value ||
        outreachTaskActive.value ||
        contactSaving.value ||
        contactUpdating.value ||
        contactsLoading.value ||
        outreachStore.postId !== post.id ||
        selectedPostId.value !== post.id
    ) {
        return
    }

    outreachExpanded.value = false
    activePanel.value = 'outreach'

    await outreachStore.startContactDiscovery(post).catch(() => false)
}

function discoverAnotherContact() {
    const post = outreachPost.value

    if (post !== null) {
        void startContactDiscovery(post)
    }
}

async function openOutreach() {
    const post = selectedPost.value

    if (post === null || contactSaving.value || contactUpdating.value || contactsLoading.value) {
        return
    }

    if (outreachTaskActive.value) {
        if (outreachStore.postId === post.id) {
            outreachExpanded.value = false
            activePanel.value = 'outreach'
        }

        return
    }

    outreachStore.openForPost(post.id)
    outreachExpanded.value = false
    activePanel.value = 'outreach'

    try {
        const savedContacts = await outreachStore.fetchContacts(post.id)

        if (
            !viewMounted ||
            outreachTaskActive.value ||
            savedContacts === null ||
            outreachStore.postId !== post.id ||
            selectedPostId.value !== post.id ||
            activePanel.value !== 'outreach'
        ) {
            return
        }

        if (savedContacts.length > 0) {
            activePanel.value = 'outreach'
            return
        }

        await startContactDiscovery(post)
    } catch {
        // The contact list owns the error; preserve the user's current panel.
    }
}

async function cancelOutreach() {
    await outreachStore.cancelActiveTask().catch(() => false)
}

function expandOutreach() {
    outreachExpanded.value = true
    activePanel.value = 'outreach'
}

function collapseOutreach() {
    outreachExpanded.value = false
    activePanel.value = 'outreach'
}

async function updateUserLabel(userLabel: UserLabel | null) {
    const post = selectedPost.value

    if (
        post === null ||
        applyQueuePostIds.value === null ||
        labelUpdating.value ||
        applicationUpdating.value
    ) {
        return
    }

    const postId = post.id
    const previousUserLabel = post.userLabel
    const retainedForgoneLabel =
        userLabel === 'forgo' && previousUserLabel !== null && previousUserLabel !== 'forgo'
            ? previousUserLabel
            : null
    labelUpdating.value = true
    labelError.value = null
    applicationError.value = null

    if (retainedForgoneLabel !== null) {
        retainedForgoneLabelByPostId.set(postId, retainedForgoneLabel)
    }

    try {
        const result = await postStore.updatePost(postId, { userLabel })

        if (userLabel === 'forgo') {
            return
        }

        retainedForgoneLabelByPostId.delete(postId)
        updateApplyQueueMembership(postId, result.inApplyQueue)
    } catch (error) {
        if (retainedForgoneLabel !== null) {
            retainedForgoneLabelByPostId.delete(postId)
        }

        if (selectedPostId.value === postId) {
            labelError.value = error instanceof Error ? error.message : 'Could not update label'
        }
    } finally {
        labelUpdating.value = false
    }
}

async function markApplied() {
    const post = selectedPost.value

    if (
        post === null ||
        applyQueuePostIds.value === null ||
        applicationUpdating.value ||
        labelUpdating.value
    ) {
        return
    }

    const postId = post.id
    applicationUpdating.value = true
    applicationError.value = null
    labelError.value = null

    try {
        await postStore.updatePost(postId, {
            applicationStatus: 'awaiting-response',
        })
    } catch (error) {
        if (selectedPostId.value === postId) {
            applicationError.value =
                error instanceof Error ? error.message : 'Could not update application status'
        }
    } finally {
        applicationUpdating.value = false
    }
}

async function loadApplyQueue() {
    listLoading.value = true
    listError.value = null

    try {
        const items = await postStore.fetchApplyQueue()
        applyQueuePostIds.value = items.map(({ post }) => post.id)
        recommendationContextByPostId.value = new Map(
            items.map(({ post, recommendationContext }) => [post.id, recommendationContext]),
        )
    } catch (error) {
        listError.value = error instanceof Error ? error.message : 'Could not load Apply queue'
    } finally {
        listLoading.value = false
    }
}

async function restoreOutreach() {
    const restoredPostId = outreachPostId.value

    if (!hasOutreachTaskSession.value) {
        const returnPostId = outreachStore.postId

        if (!restoreContactListPending.value || returnPostId === null) {
            return
        }

        if (postStore.findPost(returnPostId) === null) {
            await postStore.fetchPost(returnPostId).catch(() => null)
        }

        if (!viewMounted || !restoreContactListPending.value) {
            return
        }

        selectedPostId.value = returnPostId
        outreachExpanded.value = false
        activePanel.value = 'outreach'
        await outreachStore.restoreContactList()

        if (outreachPost.value === null) {
            showPosts()
        }

        return
    }

    if (restoredPostId === null) {
        return
    }

    if (postStore.findPost(restoredPostId) === null) {
        await postStore.fetchPost(restoredPostId).catch(() => null)
    }

    if (!viewMounted || !hasOutreachTaskSession.value || outreachStore.postId !== restoredPostId) {
        return
    }

    selectedPostId.value = restoredPostId
    outreachExpanded.value = false
    activePanel.value = 'outreach'
    await outreachStore.restoreTaskContext()

    if (!outreachTaskVisible.value && outreachPost.value === null) {
        showPosts()
    }
}

onMounted(() => {
    void loadApplyQueue().then(restoreOutreach)
})
</script>

<template>
    <section class="apply-layout" aria-label="Job applications">
        <div class="apply-panels">
            <JobPostListPanel
                class="apply-panel apply-post-list glass-frame"
                data-testid="apply-posts-panel"
                :active="activePanel === 'posts'"
                :adjacent="activePanel === 'viewer' && outreachContact === null"
                aria-label="Job posts"
                eyebrow="Apply"
                title="Queue"
                title-tag="h1"
                :posts="filteredPosts"
                :selected-post-id="selectedPostId"
                :loading="listLoading"
                :error="listError"
                loading-message="Loading Apply queue…"
                empty-message="No job posts match this filter."
                @select="selectPost"
                @retry="loadApplyQueue"
            >
                <template #heading-controls>
                    <span class="item-count">{{ filteredPosts.length }} posts</span>

                    <div class="post-filter">
                        <span>Filter</span>
                        <BaseDropdown
                            class="post-filter-dropdown"
                            accessible-label="Filter job posts"
                            test-id="apply-post-filter"
                            :disabled="false"
                            :options="postFilterOptions"
                            :label="postFilterLabel"
                            @select="selectPostFilter"
                        />
                    </div>
                </template>
            </JobPostListPanel>

            <JobPostViewPanel
                v-if="selectedPost"
                class="apply-panel apply-job-post-view glass-frame"
                data-testid="apply-viewer-panel"
                :active="activePanel === 'viewer'"
                :adjacent="
                    activePanel === 'posts' || (activePanel === 'outreach' && !outreachExpanded)
                "
                :back-label="activePanel !== 'posts' ? 'Back to job posts' : undefined"
                :post="selectedPost"
                :recommendation="selectedRecommendationContext ?? undefined"
                :label-updating="labelUpdating || applyQueuePostIds === null"
                :label-error="labelError"
                :mode="applyViewerMode"
                @back="showPosts"
                @update-label="updateUserLabel"
                @open-outreach="openOutreach"
                @mark-applied="markApplied"
            />

            <OutreachPanel
                v-if="outreachPost !== null || outreachTaskVisible || restoreContactListPending"
                class="apply-panel apply-outreach glass-frame"
                data-testid="apply-outreach-panel"
                :class="{
                    'apply-outreach-contact': outreachContact,
                }"
                :active="activePanel === 'outreach'"
                :adjacent="
                    activePanel === 'viewer' && outreachContact !== null && !outreachExpanded
                "
                :post="outreachPost"
                :expanded="outreachExpanded"
                @cancel="cancelOutreach"
                @collapse="collapseOutreach"
                @discover="discoverAnotherContact"
                @expand="expandOutreach"
                @retry-contacts="openOutreach"
                @show-viewer="showViewer"
            />
        </div>
    </section>
</template>

<style scoped lang="scss">
.apply-layout {
    display: flex;
    flex: 1;
    max-height: calc(100dvh - ($space-3 * 2));
    min-height: 0;
}

.apply-panels {
    display: flex;
    flex: 1;
    gap: $space-4;
    min-height: 0;
    min-width: 0;
}

.apply-panel {
    &.apply-post-list {
        min-width: 0;

        @include bp-md-tablet {
            min-width: 26em;
        }
    }

    &.apply-job-post-view {
        flex: 2;
        padding: $space-5;
    }

    &.apply-outreach {
        overflow: hidden;
        flex: 1.5;
        padding: $space-5;

        &-contact {
            flex: 2.5;
        }
    }
}

.item-count,
.post-filter {
    color: $color-ink-muted;
    font-size: 0.75rem;
}

.post-filter {
    display: flex;
    gap: $space-3;
    align-items: center;

    &-dropdown {
        min-width: 7rem;
    }
}
</style>
