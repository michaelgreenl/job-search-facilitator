<script setup lang="ts">
import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import AgentTaskPanel from '@/components/agent/AgentTaskPanel.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import { useAgentTask } from '@/composables/useAgentTask'
import ExpandIcon from '@/components/svgs/ExpandIcon.vue'
import ShrinkIcon from '@/components/svgs/ShrinkIcon.vue'
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

defineOptions({ inheritAttrs: false })

const emit = defineEmits<{
    cancel: []
    collapse: []
    discover: []
    expand: []
    retryContacts: []
    showViewer: []
}>()

const outreachStore = useOutreachStore()
const { cancelling, connectionState, error, starting, task, taskActive } = useAgentTask('outreach')
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
const issue = computed(() => error.value ?? task.value?.error ?? resultError.value)
const backLabel = computed(() =>
    panelView.value === 'contacts' ? 'Back to job post' : 'Back to saved contacts',
)
const backTestId = computed(() =>
    panelView.value === 'contacts' ? 'back-to-job-post' : 'back-to-saved-contacts',
)
const statusMessage = computed(() =>
    contactSaving.value ? 'Saving outreach…' : starting.value ? 'Starting Agent…' : null,
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
            panelView.value = 'stream'
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
    outreachStore.clearInactiveTask()
    outreachStore.clearContact()
    panelView.value = 'contacts'

    if (props.post === null) {
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
    <AgentTaskPanel
        v-if="panelView === 'stream'"
        v-bind="$attrs"
        as="aside"
        :active="active"
        :adjacent="adjacent"
        lane="outreach"
        eyebrow="Outreach"
        back-label="Back to saved contacts"
        back-test-id="back-to-saved-contacts"
        :cancelling="cancelling"
        :running="canCancel"
        :issue="issue"
        :status-message="statusMessage"
        status-test-id="outreach-task-status"
        cancel-label="Cancel outreach"
        cancel-test-id="outreach-cancel"
        @back="showContacts"
        @cancel="emit('cancel')"
    />

    <BasePanel
        v-else
        v-bind="$attrs"
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
