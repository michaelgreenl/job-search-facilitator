<script setup lang="ts">
import { computed } from 'vue'
import AgentTaskPanel from '@/components/agent/AgentTaskPanel.vue'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    cancelling: boolean
    issue: string | null
    retryAvailable: boolean
    running: boolean
    saving: boolean
    starting: boolean
    taskId: string | null
}>()

const emit = defineEmits<{
    cancel: []
    retry: []
    back: []
}>()

const statusMessage = computed(() =>
    props.saving ? 'Saving job post…' : props.starting ? 'Starting Agent…' : null,
)
const statusTestId = computed(() =>
    props.saving ? 'job-post-save-status' : props.starting ? 'job-post-start-status' : undefined,
)
</script>

<template>
    <AgentTaskPanel
        :active="active"
        :adjacent="adjacent"
        aria-label="Add job post"
        :task-id="taskId"
        eyebrow="Job post import"
        title="Add job post"
        back-label="Back to added job posts"
        back-test-id="back-from-job-post-import"
        :cancelling="cancelling"
        :running="running"
        :issue="issue"
        :status-message="statusMessage"
        :status-test-id="statusTestId"
        cancel-test-id="cancel-job-post-import"
        :retry-available="retryAvailable"
        retry-test-id="retry-job-post-import"
        @back="emit('back')"
        @cancel="emit('cancel')"
        @retry="emit('retry')"
    />
</template>
