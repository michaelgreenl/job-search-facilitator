<script setup lang="ts">
import type { AgentModel, AgentModelSelection, Automation } from '@job-search-facilitator/core'
import { shallowRef, watch } from 'vue'
import AgentModelSelect from '@/components/agent/AgentModelSelect.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'

const props = defineProps<{
    /** The automation to edit. The dialog is open while this is set. */
    automation: Automation | null
    models: AgentModel[]
    /** The choice shown first when the automation has no model of its own. */
    fallback: AgentModelSelection
    saving: boolean
    error: string
}>()

const emit = defineEmits<{
    close: []
    save: [model: AgentModelSelection]
}>()

const selection = shallowRef<AgentModelSelection>(props.fallback)

watch(
    () => props.automation,
    (automation) => {
        if (automation) selection.value = automation.model ?? props.fallback
    },
)
</script>

<template>
    <BasePopUp
        :open="automation !== null"
        heading="Model and reasoning"
        :eyebrow="automation?.name"
        :error="error"
        class="model-dialog"
        data-testid="automation-model-dialog"
        @close="!saving && emit('close')"
    >
        <form class="model-form" :aria-busy="saving" @submit.prevent="emit('save', selection)">
            <AgentModelSelect
                :models="models"
                :selection="selection"
                :disabled="saving"
                test-id="automation"
                @change="selection = $event"
            />
            <div class="form-actions">
                <BaseButton preset="secondary" :disabled="saving" @click="emit('close')"
                    >Cancel</BaseButton
                >
                <BaseButton
                    type="submit"
                    :disabled="
                        saving ||
                        (selection.model === automation?.model?.model &&
                            selection.reasoningEffort === automation?.model?.reasoningEffort)
                    "
                    data-testid="save-automation-model"
                    >{{ saving ? 'Saving…' : 'Save' }}</BaseButton
                >
            </div>
        </form>
    </BasePopUp>
</template>

<style scoped lang="scss">
.model-dialog {
    width: min(30rem, calc(100vw - 2rem));
    padding: $space-5;
}

.model-form {
    display: grid;
    gap: $space-5;
}

.form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
    padding-top: $space-4;
    border-top: 1px solid $color-ink-alpha-12;
}

@media (width <= 24rem) {
    .model-dialog {
        padding: $space-4;
    }
}

@media (pointer: coarse) {
    .form-actions .base-button {
        min-height: 2.75rem;
    }
}
</style>

<style lang="scss">
.model-dialog .pop-up-header {
    margin-bottom: $space-5;
}

.model-dialog .pop-up-eyebrow {
    margin-bottom: $space-2;
    font-size: 0.625rem;
    letter-spacing: 0.1em;
}

.model-dialog .pop-up-title {
    font-size: 1.5rem;
    line-height: 1.2;
}
</style>
