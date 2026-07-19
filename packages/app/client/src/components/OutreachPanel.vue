<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import OutreachDraft from '@/components/OutreachDraft.vue'
import WorkStream from '@/components/WorkStream.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'
import { createDraftTask } from '@/work-tasks'

const props = defineProps<{ post: JobPost }>()

const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { connectionState, error, pendingAction, task } = storeToRefs(workStore)
const { assistantReply, contact, draft, panelView, resultError, taskKind } =
    storeToRefs(outreachStore)
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')

const running = computed(() =>
    ['connecting', 'connected', 'reconnecting'].includes(connectionState.value),
)
const status = computed(() => {
    if (pendingAction.value !== null) {
        return 'Action required before Work can continue.'
    }

    if (task.value?.status === 'completed') {
        return resultError.value === null ? 'Draft ready.' : 'Work completed.'
    }

    if (task.value?.status === 'failed') {
        return 'Work task failed.'
    }

    switch (connectionState.value) {
        case 'connecting':
            return taskKind.value === 'draft' ? 'Starting draft task…' : 'Starting outreach task…'
        case 'connected':
            return taskKind.value === 'draft' ? 'Updating draft…' : 'Searching LinkedIn…'
        case 'reconnecting':
            return 'Connection interrupted. Retrying…'
        default:
            return 'Preparing outreach task…'
    }
})
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

watch(draft, () => {
    copyState.value = 'idle'
})

function togglePanelView() {
    panelView.value = panelView.value === 'draft' ? 'stream' : 'draft'
}

function submitDraftRequest() {
    const request = draftRequest.value.trim()

    if (contact.value === null || !draft.value.trim() || !request || running.value) {
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

async function copyDraft() {
    if (!draft.value.trim()) {
        return
    }

    try {
        await navigator.clipboard.writeText(draft.value)
        copyState.value = 'copied'
    } catch {
        copyState.value = 'failed'
    }
}
</script>

<template>
    <section class="outreach-panel" aria-labelledby="outreach-title">
        <header class="outreach-heading">
            <div class="outreach-heading-copy">
                <span class="eyebrow">Outreach</span>
                <h2 id="outreach-title" class="outreach-title">{{ post.company }}</h2>
            </div>
            <button v-if="contact" class="view-toggle" type="button" @click="togglePanelView">
                {{ panelView === 'draft' ? 'Show agent stream' : 'Back to draft' }}
            </button>
        </header>

        <template v-if="contact">
            <OutreachDraft
                v-show="panelView === 'draft'"
                v-model:draft="draft"
                v-model:request="draftRequest"
                :contact="contact"
                :assistant-reply="assistantReply"
                :running="running"
                :copy-state="copyState"
                @submit="submitDraftRequest"
                @copy="copyDraft"
            />
        </template>

        <WorkStream :status="status" :issue="issue" :show-updates="panelView === 'stream'" />
    </section>
</template>

<style scoped lang="scss">
.outreach-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
}

.outreach-heading {
    display: flex;
    gap: $space-3;
    align-items: start;
    justify-content: space-between;
}

.outreach-heading-copy {
    display: grid;
    gap: $space-1;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.outreach-title {
    margin: 0;
    font-size: 1.5rem;
}

.view-toggle {
    padding: 0;
    color: $color-ink-muted;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }
}
</style>
