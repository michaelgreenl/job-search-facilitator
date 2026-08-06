<script setup lang="ts">
import {
    USER_LABELS,
    type ApplicationArtifact,
    type ApplicationArtifactKind,
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
import {
    removeApplicationArtifact,
    uploadApplicationArtifact,
} from '@/services/application-artifacts'
import { useOutreachStore } from '@/stores/outreach'
import { usePostStore } from '@/stores/post'

type ApplyLabel = Exclude<UserLabel, 'forgo'>
type PostFilter = 'all' | ApplyLabel
type ActivePanel = 'posts' | 'viewer' | 'outreach'

const selectedPostStorageKey = 'job-search-facilitator:apply-selected-post'
const readSelectedPostId = () => {
    try {
        return globalThis.sessionStorage.getItem(selectedPostStorageKey)
    } catch {
        return null
    }
}
const storeSelectedPostId = (postId: string | null) => {
    try {
        if (postId === null) {
            globalThis.sessionStorage.removeItem(selectedPostStorageKey)
        } else {
            globalThis.sessionStorage.setItem(selectedPostStorageKey, postId)
        }
    } catch {
        // The page remains usable when storage is unavailable.
    }
}

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
    postId: outreachPostId,
    contact: outreachContact,
    taskPostIds: outreachTaskPostIds,
    taskVisible: outreachTaskVisible,
    restoreContactListPending,
} = storeToRefs(outreachStore)
const postFilter = shallowRef<PostFilter>('all')
const startupOutreachTaskPostIds = [...outreachTaskPostIds.value]
const startupOutreachPostId =
    startupOutreachTaskPostIds.length > 0 || restoreContactListPending.value
        ? outreachPostId.value
        : null
const activePanel = shallowRef<ActivePanel>(
    outreachPostId.value !== null && (outreachTaskVisible.value || restoreContactListPending.value)
        ? 'outreach'
        : 'posts',
)
const outreachExpanded = shallowRef(false)
const selectedPostId = shallowRef<string | null>(outreachPostId.value ?? readSelectedPostId())
const listLoading = shallowRef(true)
const listError = shallowRef<string | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)
const applicationUpdating = shallowRef(false)
const applicationError = shallowRef<string | null>(null)
const artifactUploading = shallowRef<ApplicationArtifactKind | null>(null)
const artifactRemoving = shallowRef<ApplicationArtifactKind | null>(null)
const artifactError = shallowRef<string | null>(null)
const artifactMessage = shallowRef<string | null>(null)
const applyQueuePostIds = shallowRef<readonly string[] | null>(null)
const retainedForgoneLabelByPostId = reactive(new Map<string, ApplyLabel>())
const recommendationContextByPostId = shallowRef<
    ReadonlyMap<string, JobRecommendationContext | null>
>(new Map())
const artifactsByPostId = reactive(new Map<string, ApplicationArtifact[]>())
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
const selectedApplicationArtifacts = computed(() =>
    selectedPostId.value === null ? [] : (artifactsByPostId.get(selectedPostId.value) ?? []),
)
const selectedRecommendationContext = computed(() =>
    selectedPostId.value === null
        ? null
        : (recommendationContextByPostId.value.get(selectedPostId.value) ?? null),
)
const outreachPost = computed(() =>
    outreachPostId.value === null ? null : postStore.findPost(outreachPostId.value),
)
const outreachActionDisabled = computed(
    () => selectedPostId.value === null || outreachStore.isPostBusy(selectedPostId.value),
)
const applyViewerMode = computed<JobPostViewPanelMode>(() => ({
    kind: 'apply',
    applicationUpdating: applicationUpdating.value || applyQueuePostIds.value === null,
    applicationError: applicationError.value,
    artifactError: artifactError.value,
    artifactMessage: artifactMessage.value,
    applicationArtifacts: selectedApplicationArtifacts.value,
    artifactRemoving: artifactRemoving.value,
    artifactUploading: artifactUploading.value,
    outreachDisabled: outreachActionDisabled.value,
}))

watch(
    filteredPosts,
    (posts) => {
        if (applyQueuePostIds.value === null) {
            return
        }

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
            outreachStore.reset()

            outreachExpanded.value = false
            labelError.value = null
            applicationError.value = null
            artifactError.value = null
            artifactMessage.value = null
        }

        if (selectedPostId.value === null) {
            activePanel.value = 'posts'
        }
    },
    { immediate: true },
)
watch(selectedPostId, storeSelectedPostId, { immediate: true })

function selectPost(postId: string) {
    const changed = postId !== selectedPostId.value
    selectedPostId.value = postId

    if (changed) {
        outreachStore.reset()
    }

    outreachExpanded.value = false
    labelError.value = null
    applicationError.value = null
    artifactError.value = null
    artifactMessage.value = null
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

        outreachStore.reset()
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
        outreachStore.isPostBusy(post.id) ||
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

    if (post === null) {
        return
    }

    if (!outreachStore.hasTaskForPost(post.id) && outreachStore.isPostBusy(post.id)) {
        return
    }

    outreachStore.openForPost(post.id, null)
    outreachExpanded.value = false
    activePanel.value = 'outreach'

    try {
        const savedContacts = await outreachStore.fetchContacts(post.id)

        if (
            !viewMounted ||
            savedContacts === null ||
            outreachStore.postId !== post.id ||
            selectedPostId.value !== post.id ||
            activePanel.value !== 'outreach'
        ) {
            return
        }

        const visibleItemCount = outreachStore.contacts.length + outreachStore.tasks.length

        if (visibleItemCount >= 2) {
            return
        }

        const soleTask = outreachStore.tasks[0]

        if (soleTask !== undefined && outreachStore.contacts.length === 0) {
            outreachStore.openTask(soleTask.taskId)
            return
        }

        if (outreachStore.contacts.length > 0) {
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

async function retryOutreach() {
    if (outreachPost.value !== null) {
        const retry =
            outreachStore.contactsError === null
                ? outreachStore.retryTask(outreachPost.value)
                : outreachStore.restoreTaskContext()
        await retry.catch(() => false)
    }
}

async function retryOutreachContacts() {
    const post = outreachPost.value

    if (post === null) {
        return
    }

    await outreachStore.fetchContacts(post.id).catch(() => null)
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

async function uploadArtifact(kind: ApplicationArtifactKind, file: File) {
    const post = selectedPost.value

    if (post === null || artifactUploading.value !== null || artifactRemoving.value !== null) {
        return
    }

    const postId = post.id
    artifactUploading.value = kind
    artifactError.value = null
    artifactMessage.value = null

    try {
        const artifact = await uploadApplicationArtifact(postId, kind, file)
        artifactsByPostId.set(postId, [
            ...(artifactsByPostId.get(postId) ?? []).filter(
                (currentArtifact) => currentArtifact.kind !== kind,
            ),
            artifact,
        ])

        if (selectedPostId.value === postId) {
            artifactMessage.value = `${artifact.fileName} uploaded.`
        }
    } catch (error) {
        if (selectedPostId.value === postId) {
            artifactError.value =
                error instanceof Error ? error.message : 'Could not upload application artifact'
        }
    } finally {
        artifactUploading.value = null
    }
}

async function removeArtifact(kind: ApplicationArtifactKind) {
    const post = selectedPost.value

    if (post === null || artifactUploading.value !== null || artifactRemoving.value !== null) {
        return
    }

    const postId = post.id
    artifactRemoving.value = kind
    artifactError.value = null
    artifactMessage.value = null

    try {
        await removeApplicationArtifact(postId, kind)
        artifactsByPostId.set(
            postId,
            (artifactsByPostId.get(postId) ?? []).filter(
                (currentArtifact) => currentArtifact.kind !== kind,
            ),
        )

        if (selectedPostId.value === postId) {
            artifactMessage.value = 'Artifact removed.'
        }
    } catch (error) {
        if (selectedPostId.value === postId) {
            artifactError.value =
                error instanceof Error ? error.message : 'Could not remove application artifact'
        }
    } finally {
        artifactRemoving.value = null
    }
}

async function loadApplyQueue() {
    listLoading.value = true
    listError.value = null

    try {
        const items = await postStore.fetchApplyQueue()
        artifactsByPostId.clear()
        for (const item of items) {
            artifactsByPostId.set(item.post.id, [...item.applicationArtifacts])
        }
        const queuePostIds = items.map(({ post }) => post.id)
        const sessionPostIds = [...startupOutreachTaskPostIds]
        const omittedTaskPostIds = [...new Set(sessionPostIds)].filter(
            (postId) => !queuePostIds.includes(postId),
        )

        await Promise.allSettled(
            omittedTaskPostIds
                .filter((postId) => postStore.findPost(postId) === null)
                .map((postId) => postStore.fetchPost(postId)),
        )

        applyQueuePostIds.value = [
            ...queuePostIds,
            ...omittedTaskPostIds.filter((postId) => postStore.findPost(postId) !== null),
        ]
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
    const restoredPostId = startupOutreachPostId

    if (restoreContactListPending.value) {
        const returnPostId = outreachStore.postId

        if (returnPostId === null) {
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

    if (!viewMounted || outreachStore.postId !== restoredPostId) {
        return
    }

    selectedPostId.value = restoredPostId
    outreachExpanded.value = false
    activePanel.value = 'outreach'

    if (!outreachTaskVisible.value && outreachContact.value === null) {
        showPosts()
    }
}

onMounted(() => {
    if (startupOutreachTaskPostIds.length > 0) {
        void outreachStore.restoreTaskContext()
    }

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
                :back-mobile-only="activePanel === 'viewer' && outreachContact === null"
                :post="selectedPost"
                :recommendation="selectedRecommendationContext ?? undefined"
                :label-updating="labelUpdating || applyQueuePostIds === null"
                :label-error="labelError"
                :mode="applyViewerMode"
                @back="showPosts"
                @update-label="updateUserLabel"
                @open-outreach="openOutreach"
                @mark-applied="markApplied"
                @remove-artifact="removeArtifact"
                @upload-artifact="uploadArtifact"
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
                @retry="retryOutreach"
                @retry-contacts="retryOutreachContacts"
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
