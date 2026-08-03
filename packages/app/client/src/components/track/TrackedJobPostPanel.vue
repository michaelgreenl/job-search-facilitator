<script setup lang="ts">
import {
    APPLICATION_STATUSES,
    type ApplicationStatus,
    type SaveJobPostNextStepInput,
    type TrackedJobPost,
} from '@job-search-facilitator/core'
import { computed, shallowRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import TrackSnapshotPopUp from './TrackSnapshotPopUp.vue'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    contactError: string | null
    contactUpdatingId: string | null
    entry: TrackedJobPost
    nextStepError: string | null
    nextStepSaving: boolean
    statusError: string | null
    statusUpdating: boolean
}>()

const emit = defineEmits<{
    back: []
    saveNextStep: [input: SaveJobPostNextStepInput]
    updateContact: [contactId: string, responded: boolean]
    updateStatus: [status: ApplicationStatus]
}>()

const statusLabels: Record<ApplicationStatus, string> = {
    'not-applied': 'Not applied',
    'awaiting-response': 'Awaiting response',
    interviewing: 'Interviewing',
    rejected: 'Rejected',
    hired: 'Hired',
}
const statusOptions: BaseDropdownOption[] = APPLICATION_STATUSES.map((status) => ({
    value: status,
    label: statusLabels[status],
    tone:
        status === 'hired'
            ? 'success'
            : status === 'rejected'
              ? 'muted'
              : status === 'not-applied'
                ? 'muted'
                : 'default',
}))
const editingNextStep = shallowRef(false)
const nextStepTitle = shallowRef('')
const nextStepDueAt = shallowRef('')
const openSnapshot = shallowRef<'application' | 'job-post' | null>(null)

const toLocalDateTime = (value: string | null) => {
    if (value === null) {
        return ''
    }

    const date = new Date(value)
    const offset = date.getTimezoneOffset() * 60_000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

watch(
    () => [props.entry.post.id, props.entry.nextStep] as const,
    ([, nextStep]) => {
        editingNextStep.value = false
        nextStepTitle.value = nextStep?.title ?? ''
        nextStepDueAt.value = toLocalDateTime(nextStep?.dueAt ?? null)
        openSnapshot.value = null
    },
    { immediate: true },
)

const statusLabel = computed(() => statusLabels[props.entry.post.applicationStatus])
const currentSnapshot = computed(() => {
    if (openSnapshot.value === 'application' && props.entry.applicationSnapshot !== null) {
        return {
            kind: openSnapshot.value,
            content: props.entry.applicationSnapshot.content,
            sourceUrl: props.entry.applicationSnapshot.sourceUrl,
            capturedAt: props.entry.applicationSnapshot.capturedAt,
        } as const
    }

    if (openSnapshot.value === 'job-post' && props.entry.jobPostSnapshot !== null) {
        return {
            kind: openSnapshot.value,
            content: props.entry.jobPostSnapshot.description,
            sourceUrl: props.entry.jobPostSnapshot.sourceUrl,
            capturedAt: props.entry.jobPostSnapshot.capturedAt,
        } as const
    }

    return null
})
const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(value),
    )

function selectStatus(value: string) {
    if (APPLICATION_STATUSES.some((status) => status === value)) {
        emit('updateStatus', value as ApplicationStatus)
    }
}

function startNextStepEdit() {
    const nextStep = props.entry.nextStep
    editingNextStep.value = true
    nextStepTitle.value = nextStep?.title ?? ''
    nextStepDueAt.value = toLocalDateTime(nextStep?.dueAt ?? new Date().toISOString())
}

function saveNextStep() {
    const dueAt = new Date(nextStepDueAt.value)

    if (!nextStepTitle.value.trim() || Number.isNaN(dueAt.getTime())) {
        return
    }

    emit('saveNextStep', {
        title: nextStepTitle.value.trim(),
        dueAt: dueAt.toISOString(),
        completedAt: null,
    })
}

function completeNextStep() {
    const nextStep = props.entry.nextStep

    if (nextStep !== null) {
        emit('saveNextStep', {
            title: nextStep.title,
            dueAt: nextStep.dueAt,
            completedAt: new Date().toISOString(),
        })
    }
}
</script>

<template>
    <BasePanel
        as="aside"
        class="tracked-job-panel glass-frame"
        :active="active"
        :adjacent="adjacent"
        back-label="Back to tracked jobs"
        back-test-id="back-to-tracked-jobs"
        back-mobile-only
        @back="emit('back')"
    >
        <div
            class="tracked-job-content"
            data-testid="tracked-job-detail"
            :data-post-id="entry.post.id"
        >
            <header class="job-heading">
                <span class="eyebrow">{{ entry.post.company }}</span>
                <h2>{{ entry.post.roleTitle }}</h2>
                <span v-if="entry.post.location" class="location">{{ entry.post.location }}</span>
            </header>

            <div class="status-row">
                <div>
                    <span class="section-label">Status</span>
                    <strong>{{ statusLabel }}</strong>
                </div>
                <BaseDropdown
                    accessible-label="Application status"
                    test-id="track-application-status"
                    :disabled="statusUpdating"
                    :label="statusUpdating ? 'Saving…' : 'Edit'"
                    :options="statusOptions"
                    @select="selectStatus"
                />
            </div>
            <p v-if="statusError" class="error" role="alert">{{ statusError }}</p>

            <section class="detail-section">
                <div class="section-heading">
                    <span class="section-label">Next step</span>
                    <BaseButton
                        preset="text"
                        data-testid="edit-next-step"
                        :disabled="nextStepSaving"
                        @click="startNextStepEdit"
                    >
                        {{ entry.nextStep === null ? 'Add' : 'Edit' }}
                    </BaseButton>
                </div>

                <form v-if="editingNextStep" class="next-step-form" @submit.prevent="saveNextStep">
                    <label>
                        <span>Action</span>
                        <input v-model="nextStepTitle" data-testid="next-step-title" required />
                    </label>
                    <label>
                        <span>Due</span>
                        <input
                            v-model="nextStepDueAt"
                            data-testid="next-step-due-at"
                            type="datetime-local"
                            required
                        />
                    </label>
                    <div class="form-actions">
                        <BaseButton preset="outline" @click="editingNextStep = false">
                            Cancel
                        </BaseButton>
                        <BaseButton
                            data-testid="save-next-step"
                            type="submit"
                            :disabled="nextStepSaving"
                        >
                            {{ nextStepSaving ? 'Saving…' : 'Save' }}
                        </BaseButton>
                    </div>
                </form>
                <div v-else-if="entry.nextStep" class="next-step" data-testid="track-next-step">
                    <strong :class="{ completed: entry.nextStep.completedAt !== null }">
                        {{ entry.nextStep.title }}
                    </strong>
                    <span>Due {{ formatDate(entry.nextStep.dueAt) }}</span>
                    <BaseButton
                        v-if="entry.nextStep.completedAt === null"
                        preset="text"
                        :disabled="nextStepSaving"
                        @click="completeNextStep"
                    >
                        Mark done
                    </BaseButton>
                </div>
                <p v-else class="empty-copy">No next step set.</p>
                <p v-if="nextStepError" class="error" role="alert">{{ nextStepError }}</p>
            </section>

            <section class="detail-section">
                <span class="section-label">Contacts</span>
                <ul v-if="entry.contacts.length" class="contact-list">
                    <li v-for="contact in entry.contacts" :key="contact.id">
                        <div>
                            <strong>{{ contact.personName }}</strong>
                            <span>{{ contact.personTitle }}</span>
                        </div>
                        <BaseButton
                            preset="text"
                            :disabled="contactUpdatingId !== null"
                            @click="emit('updateContact', contact.id, contact.respondedAt === null)"
                        >
                            {{
                                contactUpdatingId === contact.id
                                    ? 'Saving…'
                                    : contact.respondedAt === null
                                      ? 'Response pending'
                                      : 'Responded'
                            }}
                        </BaseButton>
                    </li>
                </ul>
                <p v-else class="empty-copy">No messaged contacts.</p>
                <p v-if="contactError" class="error" role="alert">{{ contactError }}</p>
            </section>

            <section class="detail-section activity-section">
                <span class="section-label">Activity</span>
                <ol v-if="entry.activities.length" class="activity-list">
                    <li v-for="activity in entry.activities" :key="activity.id">
                        <time :datetime="activity.occurredAt">{{
                            formatDate(activity.occurredAt)
                        }}</time>
                        <a
                            v-if="activity.sourceUrl"
                            :href="activity.sourceUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ activity.summary }} ↗
                        </a>
                        <span v-else>{{ activity.summary }}</span>
                    </li>
                </ol>
                <p v-else class="empty-copy">No activity recorded.</p>
            </section>

            <div class="snapshot-actions">
                <BaseButton
                    v-if="entry.applicationSnapshot"
                    data-testid="view-application-snapshot"
                    preset="outline"
                    @click="openSnapshot = 'application'"
                >
                    View application
                </BaseButton>
                <BaseButton
                    v-if="entry.jobPostSnapshot"
                    data-testid="view-job-post-snapshot"
                    preset="outline"
                    @click="openSnapshot = 'job-post'"
                >
                    View job post
                </BaseButton>
            </div>
        </div>

        <TrackSnapshotPopUp
            v-if="currentSnapshot"
            :captured-at="currentSnapshot.capturedAt"
            :content="currentSnapshot.content"
            :kind="currentSnapshot.kind"
            :open="true"
            :source-url="currentSnapshot.sourceUrl"
            @close="openSnapshot = null"
        />
    </BasePanel>
</template>

<style scoped lang="scss">
.tracked-job-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
    padding-bottom: $space-5;
    overflow-y: auto;
}

.job-heading {
    display: grid;
    gap: $space-1;

    h2 {
        margin: 0;
        font-size: clamp(1.5rem, 3vw, 2rem);
    }
}

.eyebrow,
.section-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.location,
.empty-copy,
.next-step span,
.contact-list span {
    color: $color-ink-muted;
}

.status-row,
.section-heading,
.contact-list li {
    display: flex;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
}

.status-row > div,
.detail-section,
.next-step,
.contact-list li > div {
    display: grid;
    gap: $space-1;
}

.detail-section {
    padding: $space-4;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.next-step-form {
    display: grid;
    gap: $space-3;

    label {
        display: grid;
        gap: $space-1;
        color: $color-ink-muted;
        font-size: 0.75rem;
    }

    input {
        min-width: 0;
        padding: $space-2 $space-3;
        color: $color-ink;
        color-scheme: dark;
        background: $color-ink-alpha-5;
        border: 1px solid $color-signal-light-alpha-18;
        border-radius: $radius-sm;
    }
}

.form-actions,
.snapshot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
}

.completed {
    text-decoration: line-through;
    opacity: 0.65;
}

.contact-list,
.activity-list {
    display: grid;
    gap: $space-3;
    padding: 0;
    margin: $space-2 0 0;
    list-style: none;
}

.contact-list li {
    align-items: start;
}

.contact-list span {
    font-size: 0.8125rem;
}

.activity-list li {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: $space-3;
    font-size: 0.875rem;
}

.activity-list time {
    color: $color-ink-muted;
    font-size: 0.75rem;
}

.activity-list a {
    color: $color-signal-light;
}

.error {
    margin: 0;
    color: lighten-color($color-red-600, 20%);
    font-size: 0.8125rem;
}
</style>
