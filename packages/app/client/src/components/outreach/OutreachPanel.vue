<script setup lang="ts">
import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import ButtonTooltip from '@/components/app/ButtonTooltip.vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import ExpandIcon from '@/components/svgs/ExpandIcon.vue'
import ShrinkIcon from '@/components/svgs/ShrinkIcon.vue'
import WorkStream from '@/components/work/WorkStream.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'

import OutreachContactList, { type OutreachContactFilter } from './OutreachContactList.vue'
import OutreachDraft from './OutreachDraft.vue'

type PanelView = 'contacts' | 'draft' | 'stream'

const props = defineProps<{
    post: JobPost
    expanded: boolean
}>()

const emit = defineEmits<{
    cancel: []
    collapse: []
    discover: []
    expand: []
    showViewer: []
}>()

const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { actionNeedsAttention, actionSubmitting, cancelling, error, task, taskActive } =
    storeToRefs(workStore)
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
    resultError,
} = storeToRefs(outreachStore)
const panelView = shallowRef<PanelView>(
    contact.value !== null ? 'draft' : discovering.value ? 'stream' : 'contacts',
)
const contactFilter = shallowRef<OutreachContactFilter>('all')
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const canCancel = computed(
    () =>
        task.value?.status === 'running' &&
        (panelView.value === 'stream' || (panelView.value === 'draft' && drafting.value)),
)
const issue = computed(() => error.value ?? task.value?.error ?? resultError.value)
const draftIssue = computed(() => resultError.value ?? (drafting.value ? error.value : null))
const resizeLabel = computed(() => (props.expanded ? 'Collapse panel' : 'Expand panel'))

watch(
    () => props.post.id,
    () => {
        contactFilter.value = 'all'
        panelView.value = discovering.value ? 'stream' : 'contacts'
    },
)

watch(
    discovering,
    (isDiscovering) => {
        if (isDiscovering) {
            panelView.value = 'stream'
        }
    },
    { immediate: true },
)

watch(contact, (selectedContact) => {
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
    const request = draftRequest.value.trim()

    if (contact.value === null || !draft.value.trim() || !request || taskActive.value) {
        return
    }

    void outreachStore
        .requestDraftRevision(props.post, request)
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
    <section class="outreach-panel" aria-label="Outreach">
        <header>
            <div class="outreach-heading-copy">
                <div class="panel-navigation">
                    <PanelBackButton
                        v-if="panelView === 'contacts'"
                        label="Back to job post"
                        test-id="back-to-job-post"
                        mobile-only
                        @back="emit('showViewer')"
                    />
                    <PanelBackButton
                        v-else
                        label="Back to saved contacts"
                        test-id="back-to-saved-contacts"
                        @back="showContacts"
                    />

                    <ButtonTooltip
                        v-if="panelView === 'draft'"
                        v-slot="{ tooltipId }"
                        class="panel-control-desktop"
                        :label="resizeLabel"
                    >
                        <button
                            class="panel-control panel-control-expand"
                            type="button"
                            :aria-label="resizeLabel"
                            :aria-describedby="tooltipId"
                            :aria-expanded="expanded"
                            @click="toggleExpanded"
                        >
                            <ShrinkIcon v-if="expanded" class="panel-control-icon" />
                            <ExpandIcon v-else class="panel-control-icon" />
                        </button>
                    </ButtonTooltip>
                </div>

                <span class="eyebrow">Outreach</span>
            </div>
        </header>

        <template v-if="panelView === 'contacts'">
            <OutreachContactList
                v-model:filter="contactFilter"
                :contacts="contacts"
                :discovering="discovering && taskActive"
                :error="contactsError"
                :loading="contactsLoading"
                @select="selectContact"
                @show-stream="showStream"
            />

            <ButtonTooltip v-slot="{ tooltipId }" class="discover-contact-tooltip" label="Find new">
                <button
                    class="discover-contact-button"
                    type="button"
                    aria-label="Discover another contact"
                    :aria-describedby="tooltipId"
                    :disabled="taskActive || contactsLoading || contactSaving || contactUpdating"
                    @click="emit('discover')"
                >
                    <span aria-hidden="true">+</span>
                </button>
            </ButtonTooltip>
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
                @submit="submitDraftRequest"
                @copy="copyDraft"
                @update-messaged="updateMessaged"
            />
        </template>

        <WorkStream v-else :issue="issue" />

        <button
            v-if="canCancel"
            class="cancel-action"
            type="button"
            aria-label="Cancel outreach task"
            :disabled="cancelling"
            @click="emit('cancel')"
        >
            {{ cancelling ? 'Cancelling…' : 'Cancel' }}
        </button>
    </section>
</template>

<style scoped lang="scss">
.outreach-panel {
    display: flex;
    flex-direction: column;
    gap: $space-4;
    height: 100%;
    min-height: 0;
}

.outreach-heading-copy {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
}

.panel-navigation {
    display: flex;
    gap: $space-3;
    align-items: center;
}

.discover-contact-tooltip {
    align-self: flex-end;
}

.discover-contact-button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    color: $color-ink;
    font: inherit;
    font-size: 1.25rem;
    font-weight: 650;
    line-height: 1;
    cursor: pointer;
    background: $color-action;
    border: 0;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }
}

.cancel-action {
    align-self: flex-start;
    padding: 0;
    color: $color-signal-light;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.5;
    }
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.panel-navigation > .panel-control-desktop {
    display: none;

    @include bp-md-tablet {
        display: inline-flex;
    }
}

.panel-control {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: $color-ink;
    cursor: pointer;
    background: $color-action;
    border: 0;
    border-radius: $radius-sm;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-signal;
    }

    &-expand {
        color: $color-ink-muted;
        background: transparent;

        &:hover,
        &:focus-visible {
            color: $color-signal-light;
            background: transparent;
        }
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
