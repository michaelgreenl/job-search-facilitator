<script setup lang="ts">
import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, shallowRef, useId, watch } from 'vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import ChevronRightIcon from '@/components/svgs/ChevronRightIcon.vue'
import ExpandIcon from '@/components/svgs/ExpandIcon.vue'
import ShrinkIcon from '@/components/svgs/ShrinkIcon.vue'
import WorkStream from '@/components/work/WorkStream.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'
import { createDraftTask } from '@/work-tasks'

import OutreachContactList from './OutreachContactList.vue'
import OutreachDraft from './OutreachDraft.vue'

type PanelView = 'contacts' | 'draft' | 'stream'

const props = defineProps<{
    post: JobPost
    expanded: boolean
}>()

const emit = defineEmits<{
    cancel: []
    collapse: []
    expand: []
    showViewer: []
}>()

const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { cancelling, error, task, taskActive } = storeToRefs(workStore)
const {
    assistantReply,
    contact,
    contacts,
    contactsError,
    contactsLoading,
    discovering,
    draft,
    resultError,
} = storeToRefs(outreachStore)
const panelView = shallowRef<PanelView>(contact.value === null ? 'stream' : 'draft')
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')
const resizeTooltipDismissed = shallowRef(false)
const resizeTooltipId = useId()
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const canCancel = computed(() => task.value?.status === 'running')
const issue = computed(() => error.value ?? task.value?.error ?? resultError.value)
const resizeLabel = computed(() => (props.expanded ? 'Collapse panel' : 'Expand panel'))

watch(
    task,
    (currentTask) => {
        if (currentTask?.status === 'completed' && currentTask.output !== null) {
            void outreachStore.applyTaskResult(currentTask.output).then((savedContact) => {
                if (
                    savedContact?.jobPostId === props.post.id &&
                    !discovering.value &&
                    panelView.value === 'stream'
                ) {
                    outreachStore.selectContact(savedContact)
                    panelView.value = 'draft'
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

    outreachStore.beginDraft()
    void workStore
        .startTask(createDraftTask(props.post, contact.value, draft.value, request))
        .then(() => {
            draftRequest.value = ''
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
}

function selectContact(selectedContact: OutreachContact) {
    outreachStore.selectContact(selectedContact)
    panelView.value = 'draft'
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
                        v-if="panelView !== 'contacts'"
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

                    <button
                        v-if="panelView === 'draft'"
                        class="panel-control panel-control-expand panel-control-desktop"
                        type="button"
                        :aria-label="resizeLabel"
                        :aria-describedby="resizeTooltipId"
                        :aria-expanded="expanded"
                        @mouseenter="resizeTooltipDismissed = false"
                        @mouseleave="resizeTooltipDismissed = false"
                        @focus="resizeTooltipDismissed = false"
                        @blur="resizeTooltipDismissed = false"
                        @keydown.esc.stop="resizeTooltipDismissed = true"
                        @click="toggleExpanded"
                    >
                        <ShrinkIcon v-if="expanded" class="panel-control-icon" />
                        <ExpandIcon v-else class="panel-control-icon" />
                    </button>
                    <span
                        v-if="panelView === 'draft'"
                        :id="resizeTooltipId"
                        class="panel-control-tooltip tooltip-surface"
                        :class="{ 'is-dismissed': resizeTooltipDismissed }"
                        role="tooltip"
                    >
                        {{ resizeLabel }}
                    </span>
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

        <template v-else-if="panelView === 'draft' && contact">
            <OutreachDraft
                v-model:draft="draft"
                v-model:request="draftRequest"
                :contact="contact"
                :assistant-reply="assistantReply"
                :running="taskActive"
                :copy-state="copyState"
                :expanded="expanded"
                @submit="submitDraftRequest"
                @copy="copyDraft"
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

.panel-control-tooltip {
    position: absolute;
    top: calc(2rem + $space-1);
    left: -1rem;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    transform: translateY(-$space-1);
    transition:
        opacity 150ms ease,
        transform 150ms ease,
        visibility 150ms ease;

    &::before {
        position: absolute;
        right: 0;
        bottom: 100%;
        left: 0;
        height: $space-2;
        content: '';
    }

    &:hover {
        opacity: 1;
        pointer-events: auto;
        visibility: visible;
        transform: translateY(0);
    }

    &.is-dismissed {
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
        transform: translateY(-$space-1);
    }
}

.panel-control-expand:hover + .panel-control-tooltip:not(.is-dismissed),
.panel-control-expand:focus-visible + .panel-control-tooltip:not(.is-dismissed) {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
    transform: translateY(0);
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

    &-desktop {
        display: none;

        @include bp-md-tablet {
            display: inline-flex;
        }
    }

    &-mobile-only {
        @include bp-md-tablet {
            display: none;
        }
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
