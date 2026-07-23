<script setup lang="ts">
import { USER_LABELS, type JobPost, type UserLabel } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue'
import AppDropdown, { type AppDropdownOption } from '@/components/app/AppDropdown.vue'
import JobPostList from '@/components/job-posts/JobPostList.vue'
import JobPostViewer from '@/components/job-posts/JobPostViewer.vue'
import { getUserLabelTone } from '@/components/job-posts/job-post-labels'
import FlowPanel from '@/components/layout/FlowPanel.vue'
import PanelHeading from '@/components/layout/PanelHeading.vue'
import OutreachPanel from '@/components/outreach/OutreachPanel.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { usePostStore } from '@/stores/post.store'
import { useWorkStore } from '@/stores/work.store'
import { createOutreachTask } from '@/work-tasks'

type ApplyLabel = Exclude<UserLabel, 'forgo'>
type PostFilter = 'all' | ApplyLabel
type ActivePanel = 'posts' | 'viewer' | 'outreach'

const applyLabels = USER_LABELS.filter((label): label is ApplyLabel => label !== 'forgo')
const postFilterOptions: AppDropdownOption[] = [
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
const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const {
    postId: outreachPostId,
    contact: outreachContact,
    contactSaving,
    contactUpdating,
    contactsLoading,
} = storeToRefs(outreachStore)
const postFilter = shallowRef<PostFilter>('all')
const activePanel = shallowRef<ActivePanel>(
    outreachPostId.value !== null && workStore.task !== null ? 'outreach' : 'posts',
)
const outreachExpanded = shallowRef(false)
const selectedPostId = shallowRef<string | null>(outreachPostId.value)
const listLoading = shallowRef(true)
const listError = shallowRef<string | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)
const applicationUpdating = shallowRef(false)
const applicationError = shallowRef<string | null>(null)
const retainedAppliedPostIds = reactive(new Set<string>())
let viewMounted = true

onBeforeUnmount(() => {
    viewMounted = false
})

const actionablePosts = computed(() =>
    postStore.posts.filter(
        ({ applicationStatus, id, userLabel }) =>
            userLabel !== null &&
            userLabel !== 'forgo' &&
            (applicationStatus === 'not-applied' || retainedAppliedPostIds.has(id)),
    ),
)

const filteredPosts = computed(() =>
    postFilter.value === 'all'
        ? actionablePosts.value
        : actionablePosts.value.filter(({ userLabel }) => userLabel === postFilter.value),
)
const postFilterLabel = computed(
    () => postFilterOptions.find(({ value }) => value === postFilter.value)?.label ?? 'All',
)

const selectedPost = computed(
    () => postStore.posts.find(({ id }) => id === selectedPostId.value) ?? null,
)
const outreachPost = computed(
    () => postStore.posts.find(({ id }) => id === outreachPostId.value) ?? null,
)
const outreachActionDisabled = computed(
    () =>
        contactsLoading.value ||
        contactSaving.value ||
        contactUpdating.value ||
        (workStore.taskActive &&
            (outreachPostId.value !== selectedPostId.value || activePanel.value !== 'viewer')),
)
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
            outreachStore.reset()
            outreachExpanded.value = false
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

    if (changed) {
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

function showPosts() {
    if (!filteredPosts.value.some(({ id }) => id === selectedPostId.value)) {
        selectedPostId.value = filteredPosts.value[0]?.id ?? null
        outreachStore.reset()
    }

    outreachExpanded.value = false
    activePanel.value = 'posts'
}

function showViewer() {
    outreachExpanded.value = false
    activePanel.value = 'viewer'
}

async function startContactDiscovery(post: JobPost) {
    if (
        !viewMounted ||
        workStore.taskActive ||
        contactSaving.value ||
        contactUpdating.value ||
        contactsLoading.value ||
        outreachStore.postId !== post.id ||
        selectedPostId.value !== post.id
    ) {
        return
    }

    outreachStore.beginDiscovery(post.id)
    outreachExpanded.value = false
    activePanel.value = 'outreach'

    try {
        await workStore.startTask(createOutreachTask(post))
    } catch {
        if (viewMounted && outreachStore.postId === post.id && selectedPostId.value === post.id) {
            outreachStore.cancelTask()
        }
    }
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

    if (workStore.taskActive) {
        if (outreachStore.postId === post.id) {
            outreachExpanded.value = false
            activePanel.value = 'outreach'
        }

        return
    }

    outreachStore.openForPost(post.id)
    outreachExpanded.value = false

    try {
        const savedContacts = await outreachStore.fetchContacts(post.id)

        if (
            !viewMounted ||
            workStore.taskActive ||
            savedContacts === null ||
            outreachStore.postId !== post.id ||
            selectedPostId.value !== post.id
        ) {
            return
        }

        if (savedContacts.length > 0) {
            activePanel.value = 'outreach'
            return
        }

        await startContactDiscovery(post)
    } catch {
        if (viewMounted && outreachStore.postId === post.id && selectedPostId.value === post.id) {
            outreachStore.cancelTask()
            activePanel.value = 'outreach'
        }
    }
}

async function cancelOutreach() {
    const cancelledTask = await workStore.cancelTask().catch(() => null)

    if (cancelledTask?.status !== 'cancelled') {
        return
    }

    outreachStore.cancelTask()
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
    if (selectedPostId.value === null || labelUpdating.value || applicationUpdating.value) {
        return
    }

    labelUpdating.value = true
    labelError.value = null
    applicationError.value = null

    try {
        await postStore.updatePost(selectedPostId.value, { userLabel })
    } catch (error) {
        labelError.value = error instanceof Error ? error.message : 'Could not update label'
    } finally {
        labelUpdating.value = false
    }
}

async function markApplied() {
    const post = selectedPost.value

    if (post === null || applicationUpdating.value || labelUpdating.value) {
        return
    }

    const postId = post.id
    applicationUpdating.value = true
    applicationError.value = null
    labelError.value = null
    retainedAppliedPostIds.add(postId)

    try {
        await postStore.updatePost(postId, {
            applicationStatus: 'awaiting-response',
        })
    } catch (error) {
        retainedAppliedPostIds.delete(postId)

        if (selectedPostId.value === postId) {
            applicationError.value =
                error instanceof Error ? error.message : 'Could not update application status'
        }
    } finally {
        applicationUpdating.value = false
    }
}

async function loadLabeledPosts() {
    try {
        await postStore.fetchLabeledPosts()
    } catch (error) {
        listError.value = error instanceof Error ? error.message : 'Could not load labeled posts'
    } finally {
        listLoading.value = false
    }
}

onMounted(() => {
    void loadLabeledPosts()
})
</script>

<template>
    <section class="apply-layout" aria-label="Job applications">
        <div class="apply-panels">
            <FlowPanel
                class="apply-panel apply-post-list glass-frame"
                :active="activePanel === 'posts'"
                :adjacent="activePanel === 'viewer' && outreachContact === null"
                aria-label="Job posts"
            >
                <PanelHeading eyebrow="Apply" title="Labeled posts" title-tag="h1">
                    <template #controls>
                        <span class="item-count">{{ filteredPosts.length }} posts</span>

                        <div class="post-filter">
                            <span>Filter</span>
                            <AppDropdown
                                class="post-filter-dropdown"
                                button-label="Filter job posts"
                                :disabled="false"
                                :options="postFilterOptions"
                                :label="postFilterLabel"
                                @select="selectPostFilter"
                            />
                        </div>
                    </template>
                </PanelHeading>

                <JobPostList
                    :posts="filteredPosts"
                    :selected-post-id="selectedPostId"
                    :loading="listLoading"
                    :error="listError"
                    loading-message="Loading labeled posts…"
                    empty-message="No job posts match this filter."
                    @select="selectPost"
                />
            </FlowPanel>

            <FlowPanel
                v-if="selectedPost"
                as="aside"
                class="apply-panel apply-job-post-view glass-frame"
                :active="activePanel === 'viewer'"
                :adjacent="
                    activePanel === 'posts' || (activePanel === 'outreach' && !outreachExpanded)
                "
            >
                <JobPostViewer
                    :post="selectedPost"
                    :label-updating="labelUpdating"
                    :label-error="labelError"
                    :application-updating="applicationUpdating"
                    :application-error="applicationError"
                    always-show-application-action
                    :back-label="
                        !workStore.taskActive && activePanel !== 'posts'
                            ? 'Back to job posts'
                            : null
                    "
                    :back-mobile-only="activePanel === 'viewer' && outreachContact === null"
                    show-outreach-action
                    :outreach-disabled="outreachActionDisabled"
                    show-applied-option
                    @back="showPosts"
                    @update-label="updateUserLabel"
                    @open-outreach="openOutreach"
                    @mark-applied="markApplied"
                />
            </FlowPanel>

            <FlowPanel
                v-if="outreachPost"
                as="aside"
                class="apply-panel apply-outreach glass-frame"
                :class="{
                    'apply-outreach-contact': outreachContact,
                }"
                :active="activePanel === 'outreach'"
                :adjacent="
                    activePanel === 'viewer' && outreachContact !== null && !outreachExpanded
                "
            >
                <OutreachPanel
                    :post="outreachPost"
                    :expanded="outreachExpanded"
                    @cancel="cancelOutreach"
                    @collapse="collapseOutreach"
                    @discover="discoverAnotherContact"
                    @expand="expandOutreach"
                    @show-viewer="showViewer"
                />
            </FlowPanel>
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
