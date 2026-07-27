<script setup lang="ts">
import type { WorkActionDecision, WorkActionRequired } from '@job-search-facilitator/core'
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{
    action: WorkActionRequired
    submitting: boolean
}>()

const emit = defineEmits<{
    alwaysAllow: []
    resolve: [decision: WorkActionDecision]
}>()

const actionRequired = useTemplateRef<HTMLElement>('actionRequired')
const alwaysAllowAction = useTemplateRef<HTMLButtonElement>('alwaysAllowAction')
const alwaysAllowNo = useTemplateRef<HTMLButtonElement>('alwaysAllowNo')
const confirmingAlwaysAllow = shallowRef(false)

watch(
    () => props.action,
    (action, previousAction) => {
        if (action.id !== previousAction?.id) {
            confirmingAlwaysAllow.value = false
        }

        void nextTick(() => actionRequired.value?.focus())
    },
    { immediate: true },
)

function requestAlwaysAllowConfirmation() {
    if (props.submitting) {
        return
    }

    confirmingAlwaysAllow.value = true
    void nextTick(() => alwaysAllowNo.value?.focus())
}

function cancelAlwaysAllowConfirmation() {
    confirmingAlwaysAllow.value = false
    void nextTick(() => alwaysAllowAction.value?.focus())
}
</script>

<template>
    <section
        v-if="confirmingAlwaysAllow"
        class="action-required"
        data-testid="work-action-confirmation"
        role="alertdialog"
        aria-labelledby="always-allow-title"
        aria-describedby="always-allow-message"
        @keydown.esc.stop="cancelAlwaysAllowConfirmation"
    >
        <span class="eyebrow">Confirm access</span>
        <h3 id="always-allow-title" class="action-title">Always allow for this task?</h3>
        <p id="always-allow-message" class="action-message">
            Chrome will be allowed to access every website this task visits without asking again.
        </p>

        <div class="action-buttons confirmation-buttons">
            <button
                ref="alwaysAllowNo"
                class="action-button"
                data-testid="work-action-always-allow-cancel"
                type="button"
                :disabled="submitting"
                @click="cancelAlwaysAllowConfirmation"
            >
                No
            </button>
            <button
                class="action-button action-button-primary"
                data-testid="work-action-always-allow-confirm"
                type="button"
                :disabled="submitting"
                @click="emit('alwaysAllow')"
            >
                Yes
            </button>
        </div>
    </section>

    <section
        v-else
        ref="actionRequired"
        class="action-required"
        data-testid="work-action-prompt"
        aria-labelledby="action-title"
        tabindex="-1"
    >
        <span class="eyebrow">Action required</span>
        <h3 id="action-title" class="action-title">Website access</h3>
        <p class="action-message">{{ action.message }}</p>

        <div class="action-controls">
            <button
                ref="alwaysAllowAction"
                class="action-button"
                data-testid="work-action-always-allow"
                type="button"
                :disabled="submitting"
                @click="requestAlwaysAllowConfirmation"
            >
                Always allow for this task
            </button>

            <div class="action-buttons">
                <button
                    class="action-button"
                    data-testid="work-action-decline"
                    type="button"
                    :disabled="submitting"
                    @click="emit('resolve', 'decline')"
                >
                    Decline
                </button>
                <button
                    class="action-button action-button-primary"
                    data-testid="work-action-approve"
                    type="button"
                    :disabled="submitting"
                    @click="emit('resolve', 'approve')"
                >
                    Allow
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped lang="scss">
.action-title,
.action-message {
    margin: 0;
}

.action-required {
    display: grid;
    gap: $space-1;
    padding: $space-4;
    background: $color-signal-alpha-10;
    border: 1px solid $color-signal-alpha-32;
    border-radius: $radius-md;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.action-title {
    font-size: 1rem;
}

.action-message {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.action-controls {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
    margin-top: $space-3;
}

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
    margin-left: auto;
}

.confirmation-buttons {
    margin-top: $space-3;
}

.action-button {
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid $color-signal-light-alpha-28;
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
</style>
