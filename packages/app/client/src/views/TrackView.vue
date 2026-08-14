<script setup lang="ts">
import {
    type ApplicationStatus,
    type OutreachContact,
    type TrackedJobPost,
} from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import OutreachPanel from '@/components/outreach/OutreachPanel.vue'
import JobDescriptionPanel from '@/components/track/JobDescriptionPanel.vue'
import TrackedJobPostPanel from '@/components/track/TrackedJobPostPanel.vue'
import { fetchTrackedPosts } from '@/services/job-posts'
import { updateOutreachContact } from '@/services/outreach'
import { readSessionStorage, writeSessionStorage } from '@/services/session-storage'
import { useOutreachStore } from '@/stores/outreach'
import { usePostStore } from '@/stores/post'

type ActivePanel = 'description' | 'detail' | 'outreach' | 'posts'
type PostFilter = 'open' | 'active' | 'closed' | 'awaiting-replies' | 'outreach-responses'
const selectedPostStorageKey = 'job-search-facilitator:track-selected-post'

const postStore = usePostStore()
const outreachStore = useOutreachStore()
const {
    contact: outreachContact,
    contacts: outreachContacts,
    contactsError: outreachContactsError,
    contactsLoading: outreachContactsLoading,
    postId: outreachPostId,
    taskPostIds: outreachTaskPostIds,
    tasks: outreachTasks,
    taskVisible: outreachTaskVisible,
} = storeToRefs(outreachStore)
const initialOutreachPostId = outreachTaskVisible.value ? outreachPostId.value : null
const entries = shallowRef<TrackedJobPost[]>([])
const postFilter = shallowRef<PostFilter>('open')
const selectedPostId = shallowRef<string | null>(
    initialOutreachPostId ?? readSessionStorage(selectedPostStorageKey),
)
const activePanel = shallowRef<ActivePanel>(initialOutreachPostId === null ? 'posts' : 'outreach')
const outreachExpanded = shallowRef(false)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
const statusUpdatingPostId = shallowRef<string | null>(null)
const statusError = shallowRef<string | null>(null)
const contactUpdatingId = shallowRef<string | null>(null)
const contactError = shallowRef<string | null>(null)
const recentlyMessagedContactId = shallowRef<string | null>(null)
let loadRevision = 0

const isClosedApplication = ({ applicationStatus }: TrackedJobPost['post']) =>
    applicationStatus === 'rejected' || applicationStatus === 'hired'
const openEntries = computed(() => entries.value.filter(({ post }) => !isClosedApplication(post)))
const filteredEntries = computed(() => {
    if (postFilter.value === 'active') {
        return openEntries.value.filter(({ post }) =>
            ['awaiting-response', 'interviewing'].includes(post.applicationStatus),
        )
    }

    if (postFilter.value === 'closed') {
        return entries.value.filter(({ post }) => isClosedApplication(post))
    }

    if (postFilter.value === 'awaiting-replies') {
        return openEntries.value.filter(({ contacts }) =>
            contacts.some(({ respondedAt }) => respondedAt === null),
        )
    }

    if (postFilter.value === 'outreach-responses') {
        return openEntries.value.filter(({ contacts }) =>
            contacts.some(({ respondedAt }) => respondedAt !== null),
        )
    }

    return openEntries.value
})
const selectedEntry = computed(
    () => filteredEntries.value.find(({ post }) => post.id === selectedPostId.value) ?? null,
)
const trackedPosts = computed(() => filteredEntries.value.map(({ post }) => post))
const statusUpdating = computed(
    () =>
        statusUpdatingPostId.value !== null && statusUpdatingPostId.value === selectedPostId.value,
)
const selectedContactUpdatingId = computed(() =>
    outreachContacts.value.some(({ id }) => id === contactUpdatingId.value)
        ? contactUpdatingId.value
        : null,
)
const outreachDisabled = computed(
    () =>
        selectedEntry.value === null ||
        outreachContactsLoading.value ||
        outreachStore.isPostBusy(selectedEntry.value.post.id) ||
        outreachContactsError.value !== null,
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
    openEntries.value.reduce(
        (count, { contacts }) =>
            count + contacts.filter(({ respondedAt }) => respondedAt === null).length,
        0,
    ),
)
const outreachResponses = computed(() =>
    openEntries.value.reduce(
        (count, { contacts }) =>
            count + contacts.filter(({ respondedAt }) => respondedAt !== null).length,
        0,
    ),
)
const trackStats = computed(
    () =>
        [
            {
                filter: 'active',
                testId: 'active-application-count',
                label: 'Active applications',
                count: activeApplications.value,
            },
            {
                filter: 'closed',
                testId: 'closed-application-count',
                label: 'Closed applications',
                count: closedApplications.value,
            },
            {
                filter: 'awaiting-replies',
                testId: 'pending-outreach-count',
                label: 'Awaiting replies',
                count: pendingOutreach.value,
            },
            {
                filter: 'outreach-responses',
                testId: 'outreach-response-count',
                label: 'Outreach responses',
                count: outreachResponses.value,
            },
        ] as const,
)
const attentionItems = computed(() => {
    const followUpDelay = 7 * 24 * 60 * 60 * 1_000
    const now = Date.now()

    return openEntries.value
        .flatMap((entry) => {
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

watch(filteredEntries, (currentEntries) => {
    if (currentEntries.some(({ post }) => post.id === selectedPostId.value)) {
        return
    }

    selectedPostId.value = currentEntries[0]?.post.id ?? null

    if (selectedPostId.value === null) {
        activePanel.value = 'posts'
    }
})

watch(selectedPostId, (postId) => writeSessionStorage(selectedPostStorageKey, postId))

watch([activePanel, outreachContact], ([panel, contact]) => {
    if (
        recentlyMessagedContactId.value !== null &&
        (panel !== 'outreach' || contact?.id !== recentlyMessagedContactId.value)
    ) {
        recentlyMessagedContactId.value = null
    }
})

watch(
    selectedEntry,
    (entry, previousEntry) => {
        if (entry === null) {
            return
        }

        const postChanged = previousEntry?.post.id !== entry.post.id

        if (outreachPostId.value !== entry.post.id) {
            outreachStore.openForPost(entry.post.id, null)
        }

        outreachStore.setContactsForPost(entry.post.id, entry.contacts)

        if (
            postChanged &&
            activePanel.value === 'outreach' &&
            !outreachTaskVisible.value &&
            outreachContact.value === null
        ) {
            activePanel.value = 'detail'
        }
    },
    { immediate: true },
)

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
    contactError.value = null
    outreachExpanded.value = false
    activePanel.value = 'detail'
}

function selectPostFilter(filter: Exclude<PostFilter, 'open'>) {
    postFilter.value = postFilter.value === filter ? 'open' : filter
}

function showTrackedDetail() {
    outreachExpanded.value = false
    activePanel.value = selectedEntry.value === null ? 'posts' : 'detail'
}

function handleMessagedUpdate(contact: OutreachContact) {
    recentlyMessagedContactId.value = contact.messaged ? contact.id : null
}

function handleContactRemoved() {
    recentlyMessagedContactId.value = null
    void loadTrackedPosts(false)
}

function handleDraftSaved(contact: OutreachContact) {
    entries.value = entries.value.map((entry) =>
        entry.post.id === contact.jobPostId
            ? {
                  ...entry,
                  contacts: entry.contacts.map((savedContact) =>
                      savedContact.id === contact.id ? contact : savedContact,
                  ),
              }
            : entry,
    )
}

function selectOutreachContact(contact: OutreachContact) {
    const entry = selectedEntry.value

    if (entry === null) {
        return
    }

    if (outreachPostId.value !== entry.post.id) {
        outreachStore.openForPost(entry.post.id, null)
        outreachStore.setContactsForPost(entry.post.id, entry.contacts)
    }

    outreachStore.selectContact(contact)
    outreachExpanded.value = false
    activePanel.value = 'outreach'
}

function showOutreachTask(taskId: string) {
    if (outreachStore.openTask(taskId)) {
        outreachExpanded.value = false
        activePanel.value = 'outreach'
    }
}

async function discoverContact() {
    const entry = selectedEntry.value

    if (entry === null || outreachDisabled.value) {
        return
    }

    if (outreachPostId.value !== entry.post.id) {
        outreachStore.openForPost(entry.post.id, null)
        outreachStore.setContactsForPost(entry.post.id, entry.contacts)
    }

    outreachExpanded.value = false
    activePanel.value = 'outreach'
    await outreachStore.startContactDiscovery(entry.post).catch(() => false)
}

async function cancelOutreach() {
    await outreachStore.cancelActiveTask(false).catch(() => false)
}

async function retryOutreach() {
    const entry = selectedEntry.value

    if (entry === null) {
        return
    }

    const retry =
        outreachContactsError.value === null
            ? outreachStore.retryTask(entry.post)
            : outreachStore.restoreTaskContext()
    await retry.catch(() => false)
}

async function retryOutreachContacts() {
    const entry = selectedEntry.value

    if (entry !== null) {
        await outreachStore.fetchContacts(entry.post.id).catch(() => null)
    }
}

function expandOutreach() {
    outreachExpanded.value = true
    activePanel.value = 'outreach'
}

function collapseOutreach() {
    outreachExpanded.value = false
    activePanel.value = 'outreach'
}

function openJobDescription() {
    if (selectedEntry.value?.jobPostSnapshot) {
        activePanel.value = 'description'
    }
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

onMounted(() => {
    if (outreachTaskPostIds.value.length > 0) {
        void outreachStore.restoreTaskContext()
    }

    void loadTrackedPosts()
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
            :empty-message="
                entries.length
                    ? postFilter === 'open'
                        ? 'No open applications to track.'
                        : 'No applications match this filter.'
                    : 'No applied or contacted job posts to track.'
            "
            loading-message="Loading tracked jobs…"
            show-application-status
            @select="selectPost"
            @retry="loadTrackedPosts"
        >
            <template #summary>
                <div class="track-summary">
                    <div class="track-stats">
                        <button
                            v-for="stat in trackStats"
                            :key="stat.filter"
                            :data-testid="stat.testId"
                            :data-count="stat.count"
                            :aria-pressed="postFilter === stat.filter"
                            type="button"
                            @click="selectPostFilter(stat.filter)"
                        >
                            <span>{{ stat.label }}</span>
                            <strong>{{ stat.count }}</strong>
                        </button>
                    </div>

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
            :adjacent="
                activePanel === 'posts' ||
                activePanel === 'description' ||
                (activePanel === 'outreach' && !outreachExpanded)
            "
            :back-on-desktop="
                activePanel === 'description' || (activePanel === 'outreach' && !outreachExpanded)
            "
            :contact-error="contactError"
            :contact-updating-id="selectedContactUpdatingId"
            :entry="selectedEntry"
            :outreach-contacts="outreachContacts"
            :outreach-contacts-error="outreachContactsError"
            :outreach-contacts-loading="outreachContactsLoading"
            :outreach-disabled="outreachDisabled"
            :outreach-tasks="outreachTasks"
            :recently-messaged-contact-id="recentlyMessagedContactId"
            :status-error="statusError"
            :status-updating="statusUpdating"
            @back="activePanel = 'posts'"
            @discover-contact="discoverContact"
            @open-job-description="openJobDescription"
            @retry-outreach-contacts="retryOutreachContacts"
            @select-contact="selectOutreachContact"
            @show-outreach-task="showOutreachTask"
            @update-contact="updateContact"
            @update-status="updateApplicationStatus"
        />

        <JobDescriptionPanel
            v-if="selectedEntry?.jobPostSnapshot"
            class="track-panel track-description"
            :active="activePanel === 'description'"
            :post="selectedEntry.post"
            :snapshot="selectedEntry.jobPostSnapshot"
            @back="activePanel = 'detail'"
        />

        <OutreachPanel
            v-if="selectedEntry && (outreachTaskVisible || outreachContact)"
            class="track-panel track-outreach glass-frame"
            data-testid="track-outreach-panel"
            :class="{ 'track-outreach-draft': outreachContact }"
            :active="activePanel === 'outreach'"
            :adjacent="false"
            :post="selectedEntry.post"
            :expanded="outreachExpanded"
            contacts-external
            @cancel="cancelOutreach"
            @collapse="collapseOutreach"
            @contact-removed="handleContactRemoved"
            @draft-saved="handleDraftSaved"
            @expand="expandOutreach"
            @messaged-updated="handleMessagedUpdate"
            @retry="retryOutreach"
            @show-viewer="showTrackedDetail"
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
    @include bp-md-tablet {
        max-width: 36rem;
    }
}

.track-description {
    flex: 1.2;
}

.track-outreach {
    flex: 1.5;
    padding: $space-5;
    overflow: hidden;

    &-draft {
        flex: 2.5;
    }
}

.track-summary {
    display: grid;
    gap: $space-3;
}

.track-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $space-1 $space-4;
    margin: 0;

    button {
        display: flex;
        width: 100%;
        gap: $space-2;
        align-items: baseline;
        justify-content: space-between;
        min-width: 0;
        padding: $space-1 0;
        color: inherit;
        font: inherit;
        text-align: left;
        background: transparent;
        border: 0;
        border-bottom: 1px solid $color-ink-alpha-9;
        cursor: pointer;

        &[aria-pressed='true'] {
            border-color: $color-signal-light;
        }
    }

    span {
        color: $color-ink-muted;
        font-size: 0.6875rem;
    }

    button:hover span,
    button:focus-visible span {
        color: $color-ink;
    }

    strong {
        flex: none;
        font-size: 0.9375rem;
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
</style>
