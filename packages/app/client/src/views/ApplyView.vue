<script setup lang="ts">
import { USER_LABELS, type UserLabel } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef, watch } from 'vue'
import ApplicationHelpPanel from '@/components/ApplicationHelpPanel.vue'
import JobPostCard from '@/components/JobPostCard.vue'
import JobPostViewer from '@/components/JobPostViewer.vue'
import OutreachPanel from '@/components/OutreachPanel.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { usePostStore } from '@/stores/post.store'
import { useWorkStore } from '@/stores/work.store'
import { createApplicationHelpTask, createOutreachTask } from '@/work-tasks'

type ApplyLabel = Exclude<UserLabel, 'forgo'>
type PostFilter = 'all' | ApplyLabel
type ActivePanel = 'posts' | 'viewer' | 'outreach' | 'application-help'

const applyLabels = USER_LABELS.filter((label): label is ApplyLabel => label !== 'forgo')
const postStore = usePostStore()
const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { postId: outreachPostId } = storeToRefs(outreachStore)
const postFilter = shallowRef<PostFilter>('all')
const activePanel = shallowRef<ActivePanel>(
    outreachPostId.value !== null && workStore.task !== null ? 'outreach' : 'posts',
)
const selectedPostId = shallowRef<string | null>(outreachPostId.value)
const applicationHelpPostId = shallowRef<string | null>(null)
const listLoading = shallowRef(true)
const listError = shallowRef<string | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)

const actionablePosts = computed(() =>
    postStore.posts.filter(({ userLabel }) => userLabel !== null && userLabel !== 'forgo'),
)

const filteredPosts = computed(() =>
    postFilter.value === 'all'
        ? actionablePosts.value
        : actionablePosts.value.filter(({ userLabel }) => userLabel === postFilter.value),
)

const selectedPost = computed(
    () => postStore.posts.find(({ id }) => id === selectedPostId.value) ?? null,
)
const outreachPost = computed(
    () => postStore.posts.find(({ id }) => id === outreachPostId.value) ?? null,
)
const applicationHelpPost = computed(
    () => postStore.posts.find(({ id }) => id === applicationHelpPostId.value) ?? null,
)
const workRunning = computed(() =>
    ['connecting', 'connected', 'reconnecting'].includes(workStore.connectionState),
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

        if (postId !== selectedPostId.value) {
            outreachStore.reset()
            applicationHelpPostId.value = null
        }

        selectedPostId.value = postId

        if (selectedPostId.value === null) {
            activePanel.value = 'posts'
        }
    },
    { immediate: true },
)

function selectPost(postId: string) {
    if (postId !== selectedPostId.value) {
        outreachStore.reset()
    }

    selectedPostId.value = postId
    applicationHelpPostId.value = null
    labelError.value = null
    activePanel.value = 'viewer'
}

function showPosts() {
    if (!filteredPosts.value.some(({ id }) => id === selectedPostId.value)) {
        outreachStore.reset()
        applicationHelpPostId.value = null
        selectedPostId.value = filteredPosts.value[0]?.id ?? null
    }

    activePanel.value = 'posts'
}

function showViewer() {
    activePanel.value = 'viewer'
}

function startOutreach() {
    if (selectedPost.value === null || workRunning.value) {
        return
    }

    outreachStore.begin(selectedPost.value.id)
    applicationHelpPostId.value = null
    activePanel.value = 'outreach'
    void workStore.startTask(createOutreachTask(selectedPost.value)).catch(() => undefined)
}

function startApplicationHelp() {
    if (selectedPost.value === null || workRunning.value) {
        return
    }

    applicationHelpPostId.value = selectedPost.value.id
    activePanel.value = 'application-help'
    void workStore.startTask(createApplicationHelpTask(selectedPost.value)).catch(() => undefined)
}

async function updateUserLabel(userLabel: UserLabel | null) {
    if (selectedPostId.value === null || labelUpdating.value) {
        return
    }

    labelUpdating.value = true
    labelError.value = null

    try {
        await postStore.updatePost(selectedPostId.value, { userLabel })
    } catch (error) {
        labelError.value = error instanceof Error ? error.message : 'Could not update label'
    } finally {
        labelUpdating.value = false
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
            <section
                class="apply-panel apply-post-list glass-frame"
                :class="{
                    'is-active': activePanel === 'posts',
                    'is-adjacent': activePanel === 'viewer',
                }"
                aria-label="Job posts"
            >
                <header class="panel-heading">
                    <div class="panel-title">
                        <span class="eyebrow">Apply</span>
                        <h1 class="panel-heading-title">Labeled posts</h1>
                    </div>

                    <div class="panel-controls">
                        <span class="item-count">{{ filteredPosts.length }} posts</span>

                        <label class="post-filter">
                            <span>Filter</span>
                            <span class="select-field">
                                <select
                                    v-model="postFilter"
                                    class="select-control post-filter-select"
                                    aria-label="Filter job posts"
                                >
                                    <option value="all">All</option>
                                    <option
                                        v-for="label in applyLabels"
                                        :key="label"
                                        :value="label"
                                    >
                                        {{ label }}
                                    </option>
                                </select>
                            </span>
                        </label>
                    </div>
                </header>

                <p v-if="listLoading" class="list-message">Loading labeled posts…</p>
                <p v-else-if="listError" class="list-message">{{ listError }}</p>
                <ul v-else-if="filteredPosts.length" class="card-list">
                    <li v-for="post in filteredPosts" :key="post.id">
                        <JobPostCard
                            :post="post"
                            :selected="selectedPostId === post.id"
                            @select="selectPost(post.id)"
                        />
                    </li>
                </ul>
                <p v-else class="list-message">No job posts match this filter.</p>
            </section>

            <aside
                v-if="selectedPost"
                class="apply-panel apply-job-post-view glass-frame"
                :class="{
                    'is-active': activePanel === 'viewer',
                    'is-adjacent':
                        activePanel === 'posts' ||
                        activePanel === 'outreach' ||
                        activePanel === 'application-help',
                }"
            >
                <button
                    v-if="!workRunning"
                    class="back-button"
                    type="button"
                    aria-label="Back to job posts"
                    @click="showPosts"
                >
                    ←
                </button>
                <JobPostViewer
                    :post="selectedPost"
                    :label-updating="labelUpdating"
                    :label-error="labelError"
                    show-outreach-action
                    :outreach-disabled="workRunning"
                    show-application-help-action
                    :application-help-disabled="workRunning"
                    @update-label="updateUserLabel"
                    @start-outreach="startOutreach"
                    @start-application-help="startApplicationHelp"
                />
            </aside>

            <aside
                v-if="outreachPost && activePanel === 'outreach'"
                class="apply-panel apply-outreach glass-frame is-active"
            >
                <button
                    v-if="!workRunning"
                    class="back-button back-button-work"
                    type="button"
                    aria-label="Back to selected job post"
                    @click="showViewer"
                >
                    ←
                </button>
                <OutreachPanel :post="outreachPost" />
            </aside>

            <aside
                v-if="applicationHelpPost && activePanel === 'application-help'"
                class="apply-panel apply-application-help glass-frame is-active"
            >
                <button
                    v-if="!workRunning"
                    class="back-button back-button-work"
                    type="button"
                    aria-label="Back to selected job post"
                    @click="showViewer"
                >
                    ←
                </button>
                <ApplicationHelpPanel :post="applicationHelpPost" />
            </aside>
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
    display: none;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 24rem;
    padding: $space-5 $space-5 0;
    border-radius: $radius-lg;

    &.is-active {
        display: flex;
    }

    @include bp-md-tablet {
        min-height: 38rem;

        &.is-adjacent {
            display: flex;
            min-width: 24rem;
        }
    }

    &.apply-post-list {
        min-width: 26em;
    }

    &.apply-job-post-view {
        flex: 2;
        padding: $space-5;
    }

    &.apply-outreach,
    &.apply-application-help {
        overflow: hidden;
        padding: $space-5;
    }
}

.back-button {
    width: fit-content;
    padding: 0;
    color: $color-ink-muted;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }

    @include bp-md-tablet {
        display: none;
    }

    &-work {
        @include bp-md-tablet {
            display: block;
        }
    }
}

.panel-heading {
    display: flex;
    flex-wrap: wrap;
    gap: $space-4;
    align-items: end;
    justify-content: space-between;
}

.panel-title {
    display: grid;
    gap: $space-1;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
}

.panel-heading-title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
    text-wrap: balance;
}

.panel-controls {
    display: flex;
    flex-flow: column wrap;
    gap: $space-1;
    align-items: end;
}

.item-count,
.post-filter,
.list-message {
    color: $color-ink-muted;
}

.item-count,
.post-filter {
    font-size: 0.75rem;
}

.post-filter {
    display: flex;
    gap: $space-3;
    align-items: center;

    &-select {
        min-width: 7rem;
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

    li {
        min-width: 0;
    }
}
</style>
