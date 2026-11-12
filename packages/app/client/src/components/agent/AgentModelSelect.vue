<script lang="ts">
const effortNames: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra high',
    max: 'Max',
    ultra: 'Ultra',
}

export const effortName = (effort: string) => effortNames[effort] ?? effort
</script>

<script setup lang="ts">
import type { AgentModel, AgentModelSelection } from '@job-search-facilitator/core'
import { computed } from 'vue'
import BaseDropdown from '@/components/base/BaseDropdown.vue'

const props = defineProps<{
    models: AgentModel[]
    selection: AgentModelSelection
    disabled: boolean
    testId: string
}>()

const emit = defineEmits<{
    change: [selection: AgentModelSelection]
}>()

const model = computed(() => props.models.find(({ id }) => id === props.selection.model))
const efforts = computed(() => model.value?.reasoningEfforts ?? [])

function selectModel(id: string) {
    const next = props.models.find((candidate) => candidate.id === id)
    if (!next || id === props.selection.model) return
    // Keep the reasoning effort when the new model supports it.
    const reasoningEffort = next.reasoningEfforts.includes(props.selection.reasoningEffort)
        ? props.selection.reasoningEffort
        : next.reasoningEfforts.includes('high')
          ? 'high'
          : next.reasoningEfforts[0]!
    emit('change', { model: id, reasoningEffort })
}

function selectEffort(reasoningEffort: string) {
    if (reasoningEffort !== props.selection.reasoningEffort) {
        emit('change', { model: props.selection.model, reasoningEffort })
    }
}
</script>

<template>
    <div class="model-fields">
        <div class="field">
            <span class="field-label">Model</span>
            <BaseDropdown
                accessible-label="Model"
                :disabled="disabled || models.length === 0"
                :label="model?.name ?? selection.model"
                :options="models.map(({ id, name }) => ({ value: id, label: name }))"
                :test-id="`${testId}-model`"
                @select="selectModel"
            />
        </div>
        <div class="field">
            <span class="field-label">Reasoning</span>
            <BaseDropdown
                accessible-label="Reasoning effort"
                :disabled="disabled || efforts.length === 0"
                :label="effortName(selection.reasoningEffort)"
                :options="efforts.map((effort) => ({ value: effort, label: effortName(effort) }))"
                :test-id="`${testId}-effort`"
                @select="selectEffort"
            />
        </div>
    </div>
</template>

<style scoped lang="scss">
.model-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $space-4;
}

.field {
    display: grid;
    gap: $space-2;
    min-width: 0;
}

.field-label {
    color: $color-ink-secondary;
    font-size: 0.75rem;
}

.base-dropdown {
    width: 100%;
}

@media (width <= 30rem) {
    .model-fields {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>

<style lang="scss">
// The menu matches the field width and scrolls when the model list is long.
.model-fields .base-dropdown .list {
    left: 0;
    width: auto;
    max-height: 18rem;
    overflow-y: auto;
}

@media (pointer: coarse) {
    .model-fields .base-dropdown .trigger {
        height: 2.75rem;
    }
}
</style>
