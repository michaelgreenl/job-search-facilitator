<script setup lang="ts">
import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import AgentTaskPanel from '@/components/agent/AgentTaskPanel.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import ExpandIcon from '@/components/svgs/ExpandIcon.vue'
import ShrinkIcon from '@/components/svgs/ShrinkIcon.vue'
import TrashIcon from '@/components/svgs/TrashIcon.vue'
import { useOutreachStore } from '@/stores/outreach'

import OutreachContactList from './OutreachContactList.vue'
import OutreachDiscoverButton from './OutreachDiscoverButton.vue'
import OutreachDraft from './OutreachDraft.vue'

type PanelView = 'contacts' | 'draft' | 'stream'

const props = withDefaults(
    defineProps<{
        active: boolean
        adjacent: boolean
        post: JobPost | null
        description?: string | null
        expanded: boolean
        contactsExternal?: boolean
    }>(),
    { contactsExternal: false, description: null },
)

defineOptions({ inheritAttrs: false })

const emit = defineEmits<{
    cancel: []
    collapse: []
    discover: []
    expand: []
    contactRemoved: [contactId: string]
    draftSaved: [contact: OutreachContact]
    messagedUpdated: [contact: OutreachContact]
    retry: []
    retryContacts: []
    showViewer: []
}>()

const outreachStore = useOutreachStore()
const {
    assistantReply,
    contact,
    contactSaving,
    contactUpdateError,
    contactUpdating,
    contacts,
    contactsError,
    contactsLoading,
    drafting,
    draft,
    draftDirty,
    draftSaveError,
    draftSaving,
    resultError,
    tasks,
    taskActive: isActive,
    taskCancelling: cancelling,
    taskConnectionState: connectionState,
    taskIssue: issue,
    taskId,
    taskRetryAvailable: retryAvailable,
    taskRunning: running,
    taskStarting: starting,
    taskVisible,
} = storeToRefs(outreachStore)
const panelView = shallowRef<PanelView>(
    drafting.value
        ? 'draft'
        : contact.value !== null
          ? 'draft'
          : taskVisible.value
            ? 'stream'
            : 'contacts',
)
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const canCancel = computed(() => taskVisible.value && running.value)
const backLabel = computed(() =>
    props.contactsExternal
        ? 'Back to outreach'
        : panelView.value === 'contacts'
          ? 'Back to job post'
          : 'Back to saved contacts',
)
const backTestId = computed(() =>
    props.contactsExternal
        ? 'back-to-track-outreach'
        : panelView.value === 'contacts'
          ? 'back-to-job-post'
          : 'back-to-saved-contacts',
)
const statusMessage = computed(() =>
    contactSaving.value ? 'Saving outreach…' : starting.value ? 'Starting Agent…' : null,
)
const draftIssue = computed(
    () => draftSaveError.value ?? resultError.value ?? (drafting.value ? issue.value : null),
)
const resizeLabel = computed(() => (props.expanded ? 'Collapse panel' : 'Expand panel'))

watch(
    () => props.post?.id,
    () => {
        panelView.value = taskVisible.value ? (drafting.value ? 'draft' : 'stream') : 'contacts'
    },
)

watch(
    taskId,
    (currentTaskId, previousTaskId) => {
        if (currentTaskId !== null && currentTaskId !== previousTaskId) {
            panelView.value = drafting.value ? 'draft' : 'stream'
        } else if (currentTaskId === null && previousTaskId !== null) {
            panelView.value = contact.value === null ? 'contacts' : 'draft'
        }
    },
    { immediate: true },
)

watch(isActive, (active, wasActive) => {
    if (wasActive && !active && taskVisible.value) {
        panelView.value = drafting.value ? 'draft' : 'stream'
    }
})

watch(contact, (selectedContact) => {
    if (taskVisible.value) {
        return
    }

    if (selectedContact !== null) {
        panelView.value = 'draft'
    } else {
        panelView.value = 'contacts'
    }
})

function resetCopyState() {
    if (copyResetTimer !== null) {
        clearTimeout(copyResetTimer)
        copyResetTimer = null
    }

    copyState.value = 'idle'
}

watch(draft, resetCopyState)
onBeforeUnmount(resetCopyState)

function submitDraftRequest() {
    const post = props.post
    const request = draftRequest.value.trim()

    if (
        post === null ||
        contact.value === null ||
        !draft.value.trim() ||
        !request ||
        isActive.value
    ) {
        return
    }

    void outreachStore
        .requestDraftRevision(post, request, props.description)
        .then((started) => {
            if (started) {
                draftRequest.value = ''
            }
        })
        .catch(() => undefined)
}

function toggleExpanded() {
    if (props.expanded) {
        emit('collapse')
    } else {
        emit('expand')
    }
}

function showContacts() {
    if (!isActive.value && contactsError.value === null) {
        outreachStore.clearInactiveTask()
    }

    if (!taskVisible.value) {
        outreachStore.clearContact()
    }

    if (props.contactsExternal) {
        emit('showViewer')
    } else {
        panelView.value = 'contacts'
    }

    if (props.post === null && !props.contactsExternal) {
        emit('showViewer')
    }

    if (props.expanded) {
        emit('collapse')
    }
}

function goBack() {
    if (panelView.value === 'contacts') {
        emit('showViewer')
    } else {
        showContacts()
    }
}

function showStream(task: string) {
    outreachStore.openTask(task)
    panelView.value = drafting.value ? 'draft' : 'stream'
}

function selectContact(selectedContact: OutreachContact) {
    outreachStore.selectContact(selectedContact)
    panelView.value = 'draft'
}

async function updateMessaged(messaged: boolean) {
    if (contact.value !== null) {
        const updatedContact = await outreachStore
            .updateContactMessaged(contact.value.id, messaged)
            .catch(() => null)

        if (updatedContact !== null) {
            emit('messagedUpdated', updatedContact)
        }
    }
}

async function saveDraft() {
    const savedContact = await outreachStore.saveDraft().catch(() => null)

    if (savedContact !== null) {
        emit('draftSaved', savedContact)
    }
}

async function removeContact() {
    const selectedContact = contact.value

    if (selectedContact === null) {
        return
    }

    const removed = await outreachStore.removeContact(selectedContact.id).catch(() => false)

    if (!removed) {
        return
    }

    emit('contactRemoved', selectedContact.id)

    if (props.contactsExternal) {
        emit('showViewer')
    } else {
        panelView.value = 'contacts'
    }

    if (props.expanded) {
        emit('collapse')
    }
}

async function copyDraft() {
    if (!draft.value.trim()) {
        return
    }

    resetCopyState()

    try {
        await navigator.clipboard.writeText(draft.value)
        copyState.value = 'copied'
        copyResetTimer = setTimeout(() => {
            copyState.value = 'idle'
            copyResetTimer = null
        }, 2400)
    } catch {
        copyState.value = 'failed'
    }
}
</script>

<template>
    <AgentTaskPanel
        v-if="panelView === 'stream'"
        v-bind="$attrs"
        as="aside"
        :active="props.active"
        :adjacent="adjacent"
        :task-id="taskId"
        eyebrow="Outreach"
        :back-label="backLabel"
        :back-test-id="backTestId"
        :cancelling="cancelling"
        :running="canCancel"
        :issue="issue"
        :status-message="statusMessage"
        status-test-id="outreach-task-status"
        cancel-test-id="outreach-cancel"
        :retry-available="retryAvailable && props.post !== null"
        retry-test-id="outreach-retry"
        @back="showContacts"
        @cancel="emit('cancel')"
        @retry="emit('retry')"
    />

    <BasePanel
        v-else
        v-bind="$attrs"
        as="aside"
        :active="props.active"
        :adjacent="adjacent"
        eyebrow="Outreach"
        :back-label="backLabel"
        :back-test-id="backTestId"
        :back-mobile-only="panelView === 'contacts'"
        @back="goBack"
    >
        <template v-if="panelView === 'draft'" #controls>
            <div class="draft-panel-controls">
                <BaseButton
                    class="panel-control-desktop"
                    preset="icon"
                    :tooltip="resizeLabel"
                    :aria-label="resizeLabel"
                    :aria-expanded="expanded"
                    @click="toggleExpanded"
                >
                    <ShrinkIcon v-if="expanded" class="panel-control-icon" />
                    <ExpandIcon v-else class="panel-control-icon" />
                </BaseButton>
                <BaseButton
                    preset="icon"
                    tooltip="Remove contact"
                    data-testid="remove-outreach-contact"
                    aria-label="Remove contact"
                    :aria-busy="contactUpdating || undefined"
                    :disabled="contactUpdating || isActive"
                    @click="removeContact"
                >
                    <TrashIcon class="panel-control-icon" />
                </BaseButton>
            </div>
        </template>

        <section class="outreach-panel" aria-label="Outreach">
            <template v-if="panelView === 'contacts' && !contactsExternal">
                <OutreachContactList
                    :contacts="contacts"
                    :error="contactsError"
                    :loading="contactsLoading"
                    :tasks="tasks"
                    @retry="emit('retryContacts')"
                    @select="selectContact"
                    @show-stream="showStream"
                />

                <OutreachDiscoverButton
                    class="discover-contact-tooltip"
                    :disabled="contactsLoading || contactUpdating || contactsError !== null"
                    test-id="discover-another-contact"
                    @click="emit('discover')"
                />
            </template>

            <template v-else-if="panelView === 'draft' && contact">
                <OutreachDraft
                    v-model:draft="draft"
                    v-model:request="draftRequest"
                    :contact="contact"
                    :assistant-reply="assistantReply"
                    :can-save="draftDirty"
                    :running="isActive"
                    :requesting-changes="drafting && isActive"
                    :saving="draftSaving"
                    :copy-state="copyState"
                    :expanded="expanded"
                    :issue="draftIssue"
                    :messaged-error="contactUpdateError"
                    :messaged-updating="contactUpdating"
                    :reconnecting="connectionState === 'reconnecting'"
                    @submit="submitDraftRequest"
                    @copy="copyDraft"
                    @save="saveDraft"
                    @update-messaged="updateMessaged"
                />
            </template>
        </section>
    </BasePanel>
</template>

<style scoped lang="scss">
.outreach-panel {
    display: flex;
    flex-direction: column;
    gap: $space-4;
    height: 100%;
    min-height: 0;
}

.discover-contact-tooltip {
    align-self: flex-end;
}

.panel-control-desktop {
    display: none;

    @include bp-md-tablet {
        display: inline-flex;
    }
}

.draft-panel-controls {
    display: flex;
    gap: $space-2;
    align-items: center;
    margin-left: auto;
}

.panel-control-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
}
</style>
