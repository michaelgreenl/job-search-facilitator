<script setup lang="ts">
import type { JobPost, WorkActionDecision } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import OutreachDraft from '@/components/OutreachDraft.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'
import { createDraftTask } from '@/work-tasks'

const props = defineProps<{ post: JobPost }>()

const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { actionSubmitting, connectionState, error, events, pendingAction, task } =
    storeToRefs(workStore)
const { assistantReply, contact, draft, panelView, resultError, taskKind } =
    storeToRefs(outreachStore)
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')

const activities = computed(() =>
    events.value.flatMap((event) => (event.type === 'activity' ? [event.message] : [])),
)
const commentary = computed(() =>
    events.value.flatMap((event) => (event.type === 'message' ? [event.textDelta] : [])).join(''),
)
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

function resolveAction(decision: WorkActionDecision) {
    void workStore.resolveAction(decision).catch(() => undefined)
}

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

        <div v-show="panelView === 'stream'" class="outreach-stream">
            <p class="outreach-status" aria-live="polite">{{ status }}</p>
            <p v-if="issue" class="outreach-error" role="alert">{{ issue }}</p>

            <div class="outreach-progress">
                <ul
                    v-if="activities.length"
                    class="activity-list"
                    aria-label="Work activity"
                    role="log"
                >
                    <li v-for="(activity, index) in activities" :key="`${index}:${activity}`">
                        {{ activity }}
                    </li>
                </ul>

                <p v-if="commentary" class="commentary">{{ commentary }}</p>
            </div>
        </div>

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

        <section v-if="pendingAction" class="action-required" aria-labelledby="action-title">
            <span class="eyebrow">Action required</span>
            <h3 id="action-title" class="action-title">Website access</h3>
            <p class="action-message">{{ pendingAction.message }}</p>

            <div class="action-buttons">
                <button
                    class="action-button action-button-primary"
                    type="button"
                    :disabled="actionSubmitting"
                    @click="resolveAction('approve')"
                >
                    Allow for this task
                </button>
                <button
                    class="action-button"
                    type="button"
                    :disabled="actionSubmitting"
                    @click="resolveAction('decline')"
                >
                    Decline
                </button>
            </div>
        </section>
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

.outreach-title,
.action-title,
.outreach-status,
.outreach-error,
.action-message,
.commentary {
    margin: 0;
}

.outreach-title {
    font-size: 1.5rem;
}

.outreach-status,
.activity-list {
    color: $color-ink-muted;
    font-size: 0.8125rem;
}

.outreach-error {
    color: lighten-color($color-red-600, 20%);
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

.outreach-stream {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
}

.action-required {
    display: grid;
    gap: $space-3;
    padding: $space-4;
    background: rgb(173 123 249 / 10%);
    border: 1px solid rgb(173 123 249 / 32%);
    border-radius: $radius-md;
}

.action-title {
    font-size: 1rem;
}

.action-message,
.commentary {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
}

.action-button {
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid rgb(221 199 255 / 28%);
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        border-color: $color-signal-light;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }

    &-primary {
        color: $color-night;
        font-weight: 650;
        background: $color-signal-light;
        border-color: transparent;
    }
}

.outreach-progress {
    display: grid;
    flex: 1;
    gap: $space-3;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.activity-list {
    display: grid;
    gap: $space-1;
    margin: 0;
    padding-left: $space-5;
}

.commentary {
    white-space: pre-wrap;
}
</style>
