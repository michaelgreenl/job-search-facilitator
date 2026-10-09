<script setup lang="ts">
import { watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import { useAgentStore } from '@/stores/agent'
import AgentStream from './AgentStream.vue'

interface Props {
    as?: 'section' | 'aside'
    active: boolean
    adjacent: boolean
    taskId: string | null
    eyebrow: string
    title?: string
    backLabel: string
    backTestId: string
    cancelling: boolean
    running: boolean
    issue: string | null
    statusMessage?: string | null
    statusTestId?: string
    cancelTestId: string
    retryAvailable?: boolean
    retryTestId?: string
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<Props>(), {
    as: 'section',
    title: undefined,
    statusMessage: null,
    statusTestId: undefined,
    retryAvailable: false,
    retryTestId: undefined,
})

const agentStore = useAgentStore()
watch(
    () => props.active,
    (active, wasActive) => {
        if (wasActive && !active) agentStore.dismissFailedTasks()
    },
)

const emit = defineEmits<{
    back: []
    cancel: []
    retry: []
}>()
</script>

<template>
    <BasePanel
        :as="props.as"
        v-bind="$attrs"
        class="agent-task-panel"
        :active="props.active"
        :adjacent="props.adjacent"
        :eyebrow="props.eyebrow"
        :title="props.title"
        :back-label="props.backLabel"
        :back-test-id="props.backTestId"
        @back="emit('back')"
    >
        <div v-if="props.active" class="agent-task-content">
            <AgentStream
                :task-id="props.taskId"
                :issue="props.issue"
                :status-message="props.statusMessage"
                :status-test-id="props.statusTestId"
            />

            <div v-if="props.running || props.retryAvailable" class="task-actions">
                <BaseButton
                    v-if="props.running"
                    class="task-action"
                    :data-testid="props.cancelTestId"
                    preset="text"
                    :disabled="props.cancelling"
                    @click="emit('cancel')"
                >
                    {{ props.cancelling ? 'Cancelling…' : 'Cancel' }}
                </BaseButton>
                <BaseButton
                    v-else-if="props.retryAvailable"
                    class="task-action"
                    :data-testid="props.retryTestId"
                    preset="text"
                    @click="emit('retry')"
                >
                    Retry
                </BaseButton>
            </div>
        </div>
    </BasePanel>
</template>

<style scoped lang="scss">
.agent-task-panel {
    padding-bottom: $space-5;
    overflow: hidden;
}

.agent-task-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
}

.task-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
}

.task-action {
    font-size: 0.8125rem;

    &:disabled {
        cursor: wait;
        opacity: 0.5;
    }
}
</style>
