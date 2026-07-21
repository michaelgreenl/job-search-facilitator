<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import AppIcon from '@/components/app/AppIcon.vue'
import IconTooltip from '@/components/app/IconTooltip.vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import WorkStream from '@/components/work/WorkStream.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'
import { createDraftTask } from '@/work-tasks'

import OutreachDraft from './OutreachDraft.vue'

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
const { assistantReply, contact, draft, resultError } = storeToRefs(outreachStore)
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const canCancel = computed(() => task.value?.status === 'running')
const issue = computed(() => error.value ?? task.value?.error ?? resultError.value)

watch(
    task,
    (currentTask) => {
        if (currentTask?.status === 'completed' && currentTask.output !== null) {
            outreachStore.applyTaskResult(currentTask.output)
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
                <PanelBackButton
                    v-if="canCancel"
                    label="Cancel outreach task"
                    :disabled="cancelling"
                    @back="emit('cancel')"
                />
                <template v-else>
                    <IconTooltip
                        v-if="contact"
                        v-slot="{ tooltipId }"
                        class="panel-control-desktop"
                        :label="expanded ? 'Collapse panel' : 'Expand panel'"
                    >
                        <button
                            class="panel-control panel-control-expand"
                            type="button"
                            :aria-label="
                                expanded ? 'Collapse outreach panel' : 'Expand outreach panel'
                            "
                            :aria-describedby="tooltipId"
                            :aria-expanded="expanded"
                            @click="toggleExpanded"
                        >
                            <AppIcon
                                class="panel-control-icon"
                                :name="expanded ? 'collapse' : 'expand'"
                            />
                        </button>
                    </IconTooltip>
                    <IconTooltip
                        v-slot="{ tooltipId }"
                        :class="{
                            'panel-control-mobile-only': contact,
                        }"
                        label="Show job post"
                    >
                        <button
                            class="panel-control"
                            type="button"
                            aria-label="Show selected job post"
                            :aria-describedby="tooltipId"
                            @click="emit('showViewer')"
                        >
                            <AppIcon class="panel-control-icon" name="chevron-right" />
                        </button>
                    </IconTooltip>
                </template>
                <span class="eyebrow">Outreach</span>
            </div>
        </header>

        <template v-if="contact">
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
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
    color: $color-ink-muted;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-ink-alpha-9;
        border-color: $color-ink-alpha-12;
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

    &-expand[aria-expanded='true'] {
        color: $color-ink;
        background: $color-ink-alpha-9;
        border-color: $color-ink-alpha-12;
    }
}

.panel-control-icon {
    width: 1.25rem;
    height: 1.25rem;
}
</style>
