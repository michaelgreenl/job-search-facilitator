<script setup lang="ts">
import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import { useAgentTask } from '@/composables/useAgentTask'
import ExpandIcon from '@/components/svgs/ExpandIcon.vue'
import ShrinkIcon from '@/components/svgs/ShrinkIcon.vue'
import AgentStream from '@/components/agent/AgentStream.vue'
import { useOutreachStore } from '@/stores/outreach'

import OutreachContactList, { type OutreachContactFilter } from './OutreachContactList.vue'
import OutreachDraft from './OutreachDraft.vue'

type PanelView = 'contacts' | 'draft' | 'stream'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    post: JobPost | null
    expanded: boolean
}>()

const emit = defineEmits<{
    cancel: []
    collapse: []
    discover: []
    dismiss: []
    expand: []
    retryContacts: []
    showViewer: []
}>()

const outreachStore = useOutreachStore()
const {
    actionNeedsAttention,
    actionSubmitting,
    cancelling,
    canDismissSession,
    connectionState,
    error,
    task,
    taskActive,
} = useAgentTask('outreach')
const {
    assistantReply,
    contact,
    contactSaving,
    contactUpdateError,
    contactUpdating,
    contacts,
    contactsError,
    contactsLoading,
    discovering,
    drafting,
    draft,
    hasActiveTask,
    resultError,
} = storeToRefs(outreachStore)
const panelView = shallowRef<PanelView>(
    contact.value !== null ? 'draft' : hasActiveTask.value ? 'stream' : 'contacts',
)
const contactFilter = shallowRef<OutreachContactFilter>('all')
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const canCancel = computed(() => hasActiveTask.value && taskActive.value)
const canDismiss = computed(() => hasActiveTask.value && canDismissSession.value)
const issue = computed(() => error.value ?? task.value?.error ?? resultError.value)
const backLabel = computed(() => {
    if (hasActiveTask.value) {
        return undefined
    }

    return panelView.value === 'contacts' ? 'Back to job post' : 'Back to saved contacts'
})
const backTestId = computed(() =>
    panelView.value === 'contacts' ? 'back-to-job-post' : 'back-to-saved-contacts',
)
const draftIssue = computed(
    () => resultError.value ?? (drafting.value ? (error.value ?? task.value?.error ?? null) : null),
)
const resizeLabel = computed(() => (props.expanded ? 'Collapse panel' : 'Expand panel'))

watch(
    () => props.post?.id,
    () => {
        contactFilter.value = 'all'
        panelView.value = hasActiveTask.value ? 'stream' : 'contacts'
    },
)

watch(
    hasActiveTask,
    (hasTask) => {
        if (hasTask) {
            panelView.value = drafting.value && contact.value !== null ? 'draft' : 'stream'
        } else {
            panelView.value = contact.value === null ? 'contacts' : 'draft'
        }
    },
    { immediate: true },
)

watch(contact, (selectedContact) => {
    if (hasActiveTask.value) {
        if (drafting.value && selectedContact !== null) {
            panelView.value = 'draft'
        }

        return
    }

    if (selectedContact !== null) {
        panelView.value = 'draft'
    } else if (!discovering.value) {
        panelView.value = 'contacts'
    }
})

watch(
    [actionNeedsAttention, actionSubmitting],
    ([needsAttention, submitting]) => {
        if (needsAttention && !submitting) {
            panelView.value = 'stream'
        }
    },
    { immediate: true },
)

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
        taskActive.value
    ) {
        return
    }

    void outreachStore
        .requestDraftRevision(post, request)
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
    outreachStore.clearContact()
    panelView.value = 'contacts'

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

function showStream() {
    panelView.value = 'stream'
}

function selectContact(selectedContact: OutreachContact) {
    outreachStore.selectContact(selectedContact)
    panelView.value = 'draft'
}

function updateMessaged(messaged: boolean) {
    if (contact.value !== null) {
        void outreachStore.updateContactMessaged(contact.value.id, messaged).catch(() => undefined)
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
    <BasePanel
        as="aside"
        :active="active"
        :adjacent="adjacent"
        eyebrow="Outreach"
        :back-label="backLabel"
        :back-test-id="backTestId"
        :back-mobile-only="panelView === 'contacts'"
        @back="goBack"
    >
        <template v-if="panelView === 'draft'" #controls>
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
        </template>

        <section class="outreach-panel" aria-label="Outreach">
            <template v-if="panelView === 'contacts'">
                <OutreachContactList
                    v-model:filter="contactFilter"
                    :contacts="contacts"
                    :discovering="discovering && taskActive"
                    :error="contactsError"
                    :loading="contactsLoading"
                    @retry="emit('retryContacts')"
                    @select="selectContact"
                    @show-stream="showStream"
                />

                <BaseButton
                    class="discover-contact-tooltip"
                    icon-size="md"
                    preset="primary"
                    tooltip="Find new"
                    aria-label="Discover another contact"
                    :disabled="
                        taskActive ||
                        contactsLoading ||
                        contactSaving ||
                        contactUpdating ||
                        contactsError !== null
                    "
                    @click="emit('discover')"
                >
                    <span class="discover-contact-icon" aria-hidden="true">+</span>
                </BaseButton>
            </template>

            <template v-else-if="panelView === 'draft' && contact">
                <OutreachDraft
                    v-model:draft="draft"
                    v-model:request="draftRequest"
                    :contact="contact"
                    :assistant-reply="assistantReply"
                    :running="taskActive"
                    :requesting-changes="drafting && taskActive"
                    :copy-state="copyState"
                    :expanded="expanded"
                    :issue="draftIssue"
                    :messaged-error="contactUpdateError"
                    :messaged-updating="contactUpdating"
                    :reconnecting="connectionState === 'reconnecting'"
                    @submit="submitDraftRequest"
                    @copy="copyDraft"
                    @update-messaged="updateMessaged"
                />
            </template>

            <AgentStream v-else lane="outreach" :issue="issue" />

            <BaseButton
                v-if="canCancel"
                class="cancel-action"
                data-testid="outreach-cancel"
                preset="text"
                aria-label="Cancel outreach task"
                :disabled="cancelling"
                @click="emit('cancel')"
            >
                {{ cancelling ? 'Cancelling…' : 'Cancel' }}
            </BaseButton>

            <BaseButton
                v-if="canDismiss"
                class="cancel-action"
                data-testid="outreach-dismiss"
                preset="text"
                @click="emit('dismiss')"
            >
                Dismiss
            </BaseButton>
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

.discover-contact-icon {
    font-size: 1.25rem;
}

.cancel-action {
    align-self: flex-start;
    font-size: 0.8125rem;
}

.panel-control-desktop {
    display: none;

    @include bp-md-tablet {
        display: inline-flex;
    }
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
