<script setup lang="ts">
import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import ChevronRightIcon from '@/components/svgs/ChevronRightIcon.vue'
import WorkStream from '@/components/work/WorkStream.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'

import OutreachContactList from './OutreachContactList.vue'
import OutreachDraftPanel from './OutreachDraftPanel.vue'

type PanelView = 'contacts' | 'draft' | 'stream'

const props = withDefaults(
    defineProps<{
        post: JobPost
        expanded: boolean
        draftPreviewActive?: boolean
    }>(),
    {
        draftPreviewActive: false,
    },
)

const emit = defineEmits<{
    cancel: []
    collapse: []
    expand: []
    previewDraft: []
    showContacts: []
    showViewer: []
}>()

const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { actionNeedsAttention, actionSubmitting, cancelling, error, task, taskActive } =
    storeToRefs(workStore)
const { contact, contacts, contactsError, contactsLoading, discovering, resultError } =
    storeToRefs(outreachStore)
const panelView = shallowRef<PanelView>(contact.value === null ? 'stream' : 'draft')
const outreachPanel = useTemplateRef<HTMLElement>('outreachPanel')
const messageDraftAction = useTemplateRef<HTMLButtonElement>('messageDraftAction')

const canCancel = computed(() => task.value?.status === 'running')
const canPreviewDraft = computed(
    () =>
        panelView.value === 'stream' &&
        discovering.value &&
        taskActive.value &&
        !actionNeedsAttention.value &&
        !props.draftPreviewActive,
)
const issue = computed(() => error.value ?? task.value?.error ?? resultError.value)

watch(
    task,
    (currentTask) => {
        if (currentTask?.status === 'completed' && currentTask.output !== null) {
            const completedTaskId = currentTask.id
            const completedPostId = props.post.id

            void outreachStore.applyTaskResult(currentTask.output).then((savedContact) => {
                if (
                    savedContact?.jobPostId === props.post.id &&
                    outreachStore.postId === completedPostId &&
                    task.value?.id === completedTaskId &&
                    !discovering.value &&
                    panelView.value === 'stream'
                ) {
                    outreachStore.selectContact(savedContact)

                    if (!props.draftPreviewActive) {
                        panelView.value = 'draft'
                    }
                }
            })
        }
    },
    { immediate: true },
)

watch(
    () => props.post.id,
    () => {
        panelView.value = 'stream'
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

watch(
    [actionNeedsAttention, actionSubmitting],
    ([needsAttention, submitting]) => {
        if (needsAttention && !submitting) {
            panelView.value = 'stream'
        }
    },
    { immediate: true },
)

function showContacts() {
    outreachStore.clearContact()
    panelView.value = 'contacts'
    emit('showContacts')
}

function selectContact(selectedContact: OutreachContact) {
    outreachStore.selectContact(selectedContact)
    panelView.value = 'draft'
}

function focusPanel() {
    const focusTarget = messageDraftAction.value ?? outreachPanel.value

    focusTarget?.focus()
}

defineExpose({ focusPanel })
</script>

<template>
    <OutreachDraftPanel
        v-if="panelView === 'draft' && contact"
        :post="post"
        :contact="contact"
        :expanded="expanded"
        @back="showContacts"
        @cancel="emit('cancel')"
        @collapse="emit('collapse')"
        @expand="emit('expand')"
        @show-viewer="emit('showViewer')"
    />

    <section v-else ref="outreachPanel" class="outreach-panel" aria-label="Outreach" tabindex="-1">
        <header>
            <div class="outreach-heading-copy">
                <div class="panel-navigation">
                    <PanelBackButton
                        v-if="panelView === 'stream'"
                        label="Back to saved contacts"
                        @back="showContacts"
                    />
                    <button
                        class="panel-control panel-control-mobile-only"
                        type="button"
                        aria-label="Show selected job post"
                        @click="emit('showViewer')"
                    >
                        <ChevronRightIcon class="panel-control-icon" />
                    </button>
                </div>

                <span class="eyebrow">Outreach</span>
            </div>
        </header>

        <OutreachContactList
            v-if="panelView === 'contacts'"
            :contacts="contacts"
            :discovering="discovering && taskActive"
            :error="contactsError"
            :loading="contactsLoading"
            @select="selectContact"
        />

        <WorkStream v-else :issue="issue" />

        <footer v-if="canCancel" class="outreach-actions">
            <button
                class="outreach-action cancel-action"
                type="button"
                aria-label="Cancel outreach task"
                :disabled="cancelling"
                @click="emit('cancel')"
            >
                {{ cancelling ? 'Cancelling…' : 'Cancel' }}
            </button>
            <button
                v-if="canPreviewDraft"
                ref="messageDraftAction"
                class="outreach-action message-draft-action"
                type="button"
                @click="emit('previewDraft')"
            >
                Message draft
            </button>
        </footer>
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

.outreach-actions {
    display: flex;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
}

.outreach-action {
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

.message-draft-action {
    margin-left: auto;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
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

    &-mobile-only {
        @include bp-md-tablet {
            display: none;
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
