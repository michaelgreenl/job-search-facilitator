<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'
import WorkStream from '@/components/work/WorkStream.vue'
import { useOutreachStore } from '@/stores/outreach.store'
import { useWorkStore } from '@/stores/work.store'
import { createDraftTask } from '@/work-tasks'

import OutreachDraft from './OutreachDraft.vue'

const props = defineProps<{ post: JobPost }>()

const emit = defineEmits<{
    showViewer: []
}>()

const workStore = useWorkStore()
const outreachStore = useOutreachStore()
const { connectionState, error, task } = storeToRefs(workStore)
const { assistantReply, contact, draft, resultError } = storeToRefs(outreachStore)
const draftRequest = shallowRef('')
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')

const running = computed(() =>
    ['connecting', 'connected', 'reconnecting'].includes(connectionState.value),
)

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
    <section class="outreach-panel" aria-label="Outreach">
        <header>
            <div class="outreach-heading-copy">
                <PanelBackButton label="Back to selected job post" @back="emit('showViewer')" />
                <span class="eyebrow">Outreach</span>
            </div>
        </header>

        <template v-if="contact">
            <OutreachDraft
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
</style>
