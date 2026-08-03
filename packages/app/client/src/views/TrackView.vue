<script setup lang="ts">
import {
    type ApplicationStatus,
    type SaveJobPostNextStepInput,
    type TrackedJobPost,
} from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef, watch } from 'vue'
import AgentTaskPanel from '@/components/agent/AgentTaskPanel.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import TrackedJobPostPanel from '@/components/track/TrackedJobPostPanel.vue'
import { fetchTrackedPosts, saveJobPostNextStep } from '@/services/job-posts'
import { updateOutreachContact } from '@/services/outreach'
import { useJobUpdateCheckStore } from '@/stores/job-update-check'
import { usePostStore } from '@/stores/post'

type ActivePanel = 'check' | 'detail' | 'posts'

const postStore = usePostStore()
const checkStore = useJobUpdateCheckStore()
const {
    canRetry: checkCanRetry,
    issue: checkIssue,
    notice: checkNotice,
    running: checkRunning,
    savedRevision: checkSavedRevision,
    saving: checkSaving,
    taskId: checkTaskId,
    taskState: checkState,
} = storeToRefs(checkStore)
const entries = shallowRef<TrackedJobPost[]>([])
const selectedPostId = shallowRef<string | null>(null)
const activePanel = shallowRef<ActivePanel>('posts')
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
const statusUpdatingPostId = shallowRef<string | null>(null)
const statusError = shallowRef<string | null>(null)
const nextStepSavingPostId = shallowRef<string | null>(null)
const nextStepError = shallowRef<string | null>(null)
const contactUpdatingId = shallowRef<string | null>(null)
const contactError = shallowRef<string | null>(null)
let loadRevision = 0

const selectedEntry = computed(
    () => entries.value.find(({ post }) => post.id === selectedPostId.value) ?? null,
)
const trackedPosts = computed(() => entries.value.map(({ post }) => post))
const statusUpdating = computed(
    () =>
        statusUpdatingPostId.value !== null && statusUpdatingPostId.value === selectedPostId.value,
)
const nextStepSaving = computed(
    () =>
        nextStepSavingPostId.value !== null && nextStepSavingPostId.value === selectedPostId.value,
)
const selectedContactUpdatingId = computed(() =>
    selectedEntry.value?.contacts.some(({ id }) => id === contactUpdatingId.value)
        ? contactUpdatingId.value
        : null,
)
const activeApplications = computed(
    () =>
        entries.value.filter(({ post }) =>
            ['awaiting-response', 'interviewing'].includes(post.applicationStatus),
        ).length,
)
const closedApplications = computed(
    () =>
        entries.value.filter(({ post }) => ['rejected', 'hired'].includes(post.applicationStatus))
            .length,
)
const pendingOutreach = computed(() =>
    entries.value.reduce(
        (count, { contacts }) =>
            count + contacts.filter(({ respondedAt }) => respondedAt === null).length,
        0,
    ),
)
const outreachResponses = computed(() =>
    entries.value.reduce(
        (count, { contacts }) =>
            count + contacts.filter(({ respondedAt }) => respondedAt !== null).length,
        0,
    ),
)
const attentionItems = computed(() => {
    const followUpDelay = 7 * 24 * 60 * 60 * 1_000
    const now = Date.now()

    return entries.value
        .flatMap((entry) => {
            if (entry.nextStep?.completedAt === null) {
                return [
                    {
                        postId: entry.post.id,
                        title: entry.nextStep.title,
                        dueAt: entry.nextStep.dueAt,
                    },
                ]
            }

            const pendingContact = entry.contacts.find(
                ({ messagedAt, respondedAt }) =>
                    respondedAt === null &&
                    messagedAt !== null &&
                    now - Date.parse(messagedAt) >= followUpDelay,
            )

            if (pendingContact !== undefined && pendingContact.messagedAt !== null) {
                return [
                    {
                        postId: entry.post.id,
                        title: `Follow up with ${pendingContact.personName}`,
                        dueAt: new Date(
                            Date.parse(pendingContact.messagedAt) + followUpDelay,
                        ).toISOString(),
                    },
                ]
            }

            if (
                entry.post.applicationStatus === 'awaiting-response' &&
                entry.post.appliedAt !== null &&
                now - Date.parse(entry.post.appliedAt) >= followUpDelay
            ) {
                return [
                    {
                        postId: entry.post.id,
                        title: `Follow up with ${entry.post.company}`,
                        dueAt: new Date(
                            Date.parse(entry.post.appliedAt) + followUpDelay,
                        ).toISOString(),
                    },
                ]
            }

            return []
        })
        .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
})

watch(
    entries,
    (currentEntries) => {
        if (currentEntries.some(({ post }) => post.id === selectedPostId.value)) {
            return
        }

        selectedPostId.value = currentEntries[0]?.post.id ?? null

        if (selectedPostId.value === null) {
            activePanel.value = 'posts'
        }
    },
    { immediate: true },
)

watch(checkSavedRevision, () => {
    void loadTrackedPosts(false).then((loaded) => {
        activePanel.value = loaded && selectedEntry.value !== null ? 'detail' : 'posts'
    })
})

async function loadTrackedPosts(showLoading = true) {
    const revision = ++loadRevision

    if (showLoading) {
        loading.value = true
    }
    error.value = null

    try {
        const tracked = await fetchTrackedPosts()

        if (revision !== loadRevision) {
            return true
        }

        entries.value = tracked.map((entry) => ({
            ...entry,
            post: postStore.upsertPost(entry.post),
        }))
        return true
    } catch (requestError) {
        if (revision === loadRevision) {
            error.value =
                requestError instanceof Error ? requestError.message : 'Could not load tracked jobs'
            return false
        }

        return true
    } finally {
        if (revision === loadRevision) {
            loading.value = false
        }
    }
}

function selectPost(postId: string) {
    selectedPostId.value = postId
    statusError.value = null
    nextStepError.value = null
    contactError.value = null
    activePanel.value = 'detail'
}

async function updateApplicationStatus(status: ApplicationStatus) {
    const entry = selectedEntry.value

    if (entry === null || statusUpdatingPostId.value !== null) {
        return
    }

    statusUpdatingPostId.value = entry.post.id
    statusError.value = null

    try {
        await postStore.updatePost(entry.post.id, { applicationStatus: status })
        if (!(await loadTrackedPosts(false))) {
            throw new Error(error.value ?? 'Could not refresh tracked jobs')
        }
    } catch (requestError) {
        if (selectedPostId.value === entry.post.id) {
            statusError.value =
                requestError instanceof Error ? requestError.message : 'Could not update status'
        }
    } finally {
        if (statusUpdatingPostId.value === entry.post.id) {
            statusUpdatingPostId.value = null
        }
    }
}

async function saveNextStep(input: SaveJobPostNextStepInput) {
    const entry = selectedEntry.value

    if (entry === null || nextStepSavingPostId.value !== null) {
        return
    }

    nextStepSavingPostId.value = entry.post.id
    nextStepError.value = null

    try {
        const nextStep = await saveJobPostNextStep(entry.post.id, input)
        entries.value = entries.value.map((current) =>
            current.post.id === entry.post.id ? { ...current, nextStep } : current,
        )
    } catch (requestError) {
        if (selectedPostId.value === entry.post.id) {
            nextStepError.value =
                requestError instanceof Error ? requestError.message : 'Could not save next step'
        }
    } finally {
        if (nextStepSavingPostId.value === entry.post.id) {
            nextStepSavingPostId.value = null
        }
    }
}

async function updateContact(contactId: string, responded: boolean) {
    const entry = selectedEntry.value

    if (entry === null || contactUpdatingId.value !== null) {
        return
    }

    contactUpdatingId.value = contactId
    contactError.value = null

    try {
        await updateOutreachContact(entry.post.id, contactId, { responded })
        if (!(await loadTrackedPosts(false))) {
            throw new Error(error.value ?? 'Could not refresh tracked jobs')
        }
    } catch (requestError) {
        if (selectedPostId.value === entry.post.id) {
            contactError.value =
                requestError instanceof Error
                    ? requestError.message
                    : 'Could not update outreach status'
        }
    } finally {
        if (contactUpdatingId.value === contactId) {
            contactUpdatingId.value = null
        }
    }
}

async function startUpdateCheck() {
    if (checkTaskId.value !== null) {
        activePanel.value = 'check'
        return
    }

    if (await checkStore.start().catch(() => false)) {
        activePanel.value = 'check'
    }
}

async function retryUpdateCheck() {
    await checkStore.retry().catch(() => false)
}

async function cancelUpdateCheck() {
    await checkStore.cancel().catch(() => undefined)
}

onMounted(() => {
    void loadTrackedPosts()

    if (checkTaskId.value !== null) {
        activePanel.value = 'check'
        void checkStore.restore().catch(() => undefined)
    }
})
</script>

<template>
    <section class="track-layout" aria-label="Application tracking">
        <JobPostListPanel
            class="track-panel track-post-list glass-frame"
            data-testid="track-posts-panel"
            :active="activePanel === 'posts'"
            :adjacent="activePanel === 'detail'"
            eyebrow="Track"
            title="Applications"
            title-tag="h1"
            :posts="trackedPosts"
            :selected-post-id="selectedPostId"
            :loading="loading"
            :error="error"
            loading-message="Loading tracked jobs…"
            empty-message="No applied or contacted job posts to track."
            @select="selectPost"
            @retry="loadTrackedPosts"
        >
            <template #heading-controls>
                <BaseButton
                    data-testid="check-job-updates"
                    preset="outline"
                    :disabled="loading || (checkTaskId === null && checkRunning)"
                    @click="startUpdateCheck"
                >
                    {{
                        checkTaskId === null
                            ? checkRunning
                                ? 'Starting…'
                                : 'Check for updates'
                            : 'View check'
                    }}
                </BaseButton>
            </template>

            <template #summary>
                <div class="track-summary">
                    <dl class="track-stats">
                        <div
                            data-testid="active-application-count"
                            :data-count="activeApplications"
                        >
                            <dt>Active applications</dt>
                            <dd>{{ activeApplications }}</dd>
                        </div>
                        <div
                            data-testid="closed-application-count"
                            :data-count="closedApplications"
                        >
                            <dt>Closed applications</dt>
                            <dd>{{ closedApplications }}</dd>
                        </div>
                        <div data-testid="pending-outreach-count" :data-count="pendingOutreach">
                            <dt>Awaiting replies</dt>
                            <dd>{{ pendingOutreach }}</dd>
                        </div>
                        <div data-testid="outreach-response-count" :data-count="outreachResponses">
                            <dt>Responses</dt>
                            <dd>{{ outreachResponses }}</dd>
                        </div>
                    </dl>

                    <p v-if="checkNotice" class="check-notice" role="status">{{ checkNotice }}</p>
                    <p v-if="checkIssue && activePanel !== 'check'" class="error" role="alert">
                        {{ checkIssue }}
                    </p>

                    <section v-if="attentionItems.length" class="attention">
                        <span class="section-label">Needs attention</span>
                        <ul>
                            <li v-for="item in attentionItems" :key="item.postId">
                                <BaseButton preset="text" @click="selectPost(item.postId)">
                                    {{ item.title }}
                                </BaseButton>
                            </li>
                        </ul>
                    </section>
                </div>
            </template>
        </JobPostListPanel>

        <TrackedJobPostPanel
            v-if="selectedEntry"
            class="track-panel"
            :active="activePanel === 'detail'"
            :adjacent="activePanel === 'posts'"
            :contact-error="contactError"
            :contact-updating-id="selectedContactUpdatingId"
            :entry="selectedEntry"
            :next-step-error="nextStepError"
            :next-step-saving="nextStepSaving"
            :status-error="statusError"
            :status-updating="statusUpdating"
            @back="activePanel = 'posts'"
            @save-next-step="saveNextStep"
            @update-contact="updateContact"
            @update-status="updateApplicationStatus"
        />

        <AgentTaskPanel
            v-if="checkTaskId !== null"
            class="track-panel glass-frame"
            data-testid="job-update-check-panel"
            :active="activePanel === 'check'"
            :adjacent="false"
            :task-id="checkTaskId"
            eyebrow="Track"
            title="Checking for updates"
            back-label="Back to tracked jobs"
            back-test-id="back-from-update-check"
            :cancelling="checkState?.cancelling ?? false"
            :running="checkRunning"
            :issue="checkIssue"
            :status-message="checkSaving ? 'Saving updates…' : null"
            cancel-test-id="cancel-update-check"
            :retry-available="checkCanRetry"
            retry-test-id="retry-update-check"
            @back="activePanel = selectedEntry === null ? 'posts' : 'detail'"
            @cancel="cancelUpdateCheck"
            @retry="retryUpdateCheck"
        />
    </section>
</template>

<style scoped lang="scss">
.track-layout {
    display: flex;
    flex: 1;
    gap: $space-4;
    max-height: calc(100dvh - ($space-3 * 2));
    min-height: 0;
}

.track-panel {
    min-width: 0;
}

.track-post-list {
    max-width: 36rem;
}

.track-summary {
    display: grid;
    gap: $space-3;
}

.track-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $space-2;
    margin: 0;

    div {
        display: grid;
        gap: $space-1;
        padding: $space-3;
        background: $color-ink-alpha-5;
        border-radius: $radius-sm;
    }

    dt {
        color: $color-ink-muted;
        font-size: 0.6875rem;
    }

    dd {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 650;
    }
}

.attention {
    display: grid;
    gap: $space-1;

    ul {
        display: grid;
        gap: $space-1;
        padding: 0;
        margin: 0;
        list-style: none;
    }
}

.section-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.check-notice,
.error {
    margin: 0;
    font-size: 0.8125rem;
}

.check-notice {
    color: $color-ink-muted;
}

.error {
    color: lighten-color($color-red-600, 20%);
}
</style>
