<script setup lang="ts">
import {
    APPLICATION_STATUSES,
    type ApplicationArtifactKind,
    type ApplicationStatus,
    type OutreachContact,
    type TrackedJobPost,
} from '@job-search-facilitator/core'
import { computed, shallowRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import OutreachContactList, {
    type OutreachContactFilter,
} from '@/components/outreach/OutreachContactList.vue'
import type { OutreachTaskListItem } from '@/components/outreach/OutreachContactCard.vue'
import OutreachDiscoverButton from '@/components/outreach/OutreachDiscoverButton.vue'
import { applicationArtifactUrl } from '@/services/application-artifacts'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    backOnDesktop: boolean
    contactError: string | null
    contactUpdatingId: string | null
    entry: TrackedJobPost
    outreachContacts: OutreachContact[]
    outreachContactsError: string | null
    outreachContactsLoading: boolean
    outreachDisabled: boolean
    outreachTasks: OutreachTaskListItem[]
    statusError: string | null
    statusUpdating: boolean
}>()

const emit = defineEmits<{
    back: []
    discoverContact: []
    openJobDescription: []
    retryOutreachContacts: []
    selectContact: [contact: OutreachContact]
    showOutreachTask: [taskId: string]
    updateContact: [contactId: string, responded: boolean]
    updateStatus: [status: ApplicationStatus]
}>()

const statusLabels: Record<ApplicationStatus, string> = {
    'not-applied': 'Not applied',
    'awaiting-response': 'Awaiting response',
    interviewing: 'Interviewing',
    rejected: 'Rejected',
    hired: 'Job Offer',
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
const artifactLabels: Record<ApplicationArtifactKind, string> = {
    resume: 'Resume',
    'cover-letter': 'Cover letter',
    'application-page': 'Application snapshot',
}

const statusLabel = computed(() => statusLabels[props.entry.post.applicationStatus])
const contactFilter = shallowRef<OutreachContactFilter>('all')
const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(value),
    )

function selectStatus(value: string) {
    if (APPLICATION_STATUSES.some((status) => status === value)) {
        emit('updateStatus', value as ApplicationStatus)
    }
}
</script>

<template>
    <BasePanel
        as="aside"
        class="tracked-job-panel glass-frame"
        :active="active"
        :adjacent="adjacent"
        :back-label="active || backOnDesktop ? 'Back to tracked jobs' : undefined"
        back-test-id="back-to-tracked-jobs"
        :back-mobile-only="!backOnDesktop"
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

            <section class="detail-section outreach-section">
                <span class="section-label">Outreach</span>

                <OutreachContactList
                    v-model:filter="contactFilter"
                    :contacts="outreachContacts"
                    :error="outreachContactsError"
                    :loading="outreachContactsLoading"
                    :show-filter="false"
                    :show-messaged-status="false"
                    :tasks="outreachTasks"
                    @retry="emit('retryOutreachContacts')"
                    @select="emit('selectContact', $event)"
                    @show-stream="emit('showOutreachTask', $event)"
                >
                    <template #contactActions="{ contact }">
                        <button
                            class="response-status-button"
                            :class="{
                                'is-responded': contact.respondedAt !== null,
                                'is-updating': contactUpdatingId === contact.id,
                            }"
                            :data-testid="`track-contact-response-toggle-${contact.id}`"
                            type="button"
                            :aria-pressed="contact.respondedAt !== null"
                            :disabled="contactUpdatingId !== null"
                            @click="emit('updateContact', contact.id, contact.respondedAt === null)"
                        >
                            <LoadingSpinner
                                v-if="contactUpdatingId === contact.id"
                                class="response-spinner"
                            />
                            <template v-if="contactUpdatingId === contact.id">Saving…</template>
                            <template v-else-if="contact.respondedAt !== null">
                                <span aria-hidden="true">✓</span>
                                Responded
                            </template>
                            <template v-else>Mark as responded</template>
                        </button>
                    </template>
                </OutreachContactList>
                <p v-if="contactError" class="error" role="alert">{{ contactError }}</p>
                <OutreachDiscoverButton
                    class="outreach-discover-button"
                    :disabled="outreachDisabled"
                    test-id="track-discover-contact"
                    @click="emit('discoverContact')"
                />
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

            <div class="artifact-actions">
                <BaseButton
                    v-for="artifact in entry.applicationArtifacts"
                    :key="artifact.kind"
                    as="a"
                    :data-testid="`view-${artifact.kind}-artifact`"
                    preset="primary"
                    :href="applicationArtifactUrl(entry.post.id, artifact.kind)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="`Open ${artifactLabels[artifact.kind]} ${artifact.fileName} in a new tab`"
                >
                    {{ artifactLabels[artifact.kind] }} ↗
                </BaseButton>
                <BaseButton
                    v-if="entry.jobPostSnapshot"
                    data-testid="view-job-description"
                    preset="primary"
                    @click="emit('openJobDescription')"
                >
                    Job description
                </BaseButton>
            </div>
        </div>
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
.empty-copy {
    color: $color-ink-muted;
}

.status-row {
    display: flex;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
}

.status-row > div,
.detail-section {
    display: grid;
    gap: $space-1;
}

.detail-section {
    padding: $space-4;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.outreach-section {
    gap: $space-3;
}

.outreach-discover-button {
    justify-self: end;
}

.artifact-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
    margin-top: auto;
}

.activity-list {
    display: grid;
    gap: $space-3;
    padding: 0;
    margin: $space-2 0 0;
    list-style: none;
}

.response-status-button {
    display: inline-flex;
    width: fit-content;
    gap: $space-1;
    align-items: center;
    padding: $space-1 $space-2;
    color: $color-ink-secondary;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    line-height: 1.25;
    cursor: pointer;
    background: transparent;
    border: 1px solid $color-ink-alpha-50;
    border-radius: $radius-full;

    &:not(.is-responded):hover:not(:disabled) {
        color: $color-ink;
        border-color: $color-signal-light-alpha-50;
    }

    &.is-responded {
        color: lighten-color($color-green-600, 35%);
        background: $color-green-600-alpha-25;
        border-color: $color-green-600-alpha-55;
    }

    &.is-updating {
        cursor: wait;
        opacity: 0.7;
    }
}

.response-spinner {
    width: 0.6875rem;
    height: 0.6875rem;
    border-width: 1.5px;
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
