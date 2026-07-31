<script setup lang="ts">
import type { AgentPermissionDecision, AgentPermissionRequired } from '@job-search-facilitator/core'
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

const props = defineProps<{
    permission: AgentPermissionRequired
    submitting: boolean
}>()

const emit = defineEmits<{
    alwaysAllow: []
    resolve: [decision: AgentPermissionDecision]
}>()

const permissionRequired = useTemplateRef<HTMLElement>('permissionRequired')
const alwaysAllowPermission = useTemplateRef<{ focus: () => void }>('alwaysAllowPermission')
const alwaysAllowNo = useTemplateRef<{ focus: () => void }>('alwaysAllowNo')
const confirmingAlwaysAllow = shallowRef(false)

watch(
    () => props.permission,
    (permission, previousPermission) => {
        if (permission.id !== previousPermission?.id) {
            confirmingAlwaysAllow.value = false
        }

        void nextTick(() => permissionRequired.value?.focus())
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
    void nextTick(() => alwaysAllowPermission.value?.focus())
}
</script>

<template>
    <section
        v-if="confirmingAlwaysAllow"
        class="permission-required"
        data-testid="agent-permission-confirmation"
        role="alertdialog"
        aria-labelledby="always-allow-title"
        aria-describedby="always-allow-message"
        @keydown.esc.stop="cancelAlwaysAllowConfirmation"
    >
        <span class="eyebrow">Confirm access</span>
        <h3 id="always-allow-title" class="permission-title">Always allow for this task?</h3>
        <p id="always-allow-message" class="permission-message">
            Chrome will be allowed to access every website this task visits without asking again.
        </p>

        <div class="permission-buttons confirmation-buttons">
            <BaseButton
                ref="alwaysAllowNo"
                data-testid="agent-permission-always-allow-cancel"
                preset="outline"
                :disabled="submitting"
                @click="cancelAlwaysAllowConfirmation"
            >
                No
            </BaseButton>
            <BaseButton
                data-testid="agent-permission-always-allow-confirm"
                preset="signal"
                :disabled="submitting"
                @click="emit('alwaysAllow')"
            >
                Yes
            </BaseButton>
        </div>
    </section>

    <section
        v-else
        ref="permissionRequired"
        class="permission-required"
        data-testid="agent-permission-prompt"
        aria-labelledby="permission-title"
        tabindex="-1"
    >
        <span class="eyebrow">Permission required</span>
        <h3 id="permission-title" class="permission-title">Website access</h3>
        <p class="permission-message">{{ permission.message }}</p>

        <div class="permission-controls">
            <BaseButton
                ref="alwaysAllowPermission"
                data-testid="agent-permission-always-allow"
                preset="outline"
                :disabled="submitting"
                @click="requestAlwaysAllowConfirmation"
            >
                Always allow for this task
            </BaseButton>

            <div class="permission-buttons">
                <BaseButton
                    data-testid="agent-permission-decline"
                    preset="outline"
                    :disabled="submitting"
                    @click="emit('resolve', 'decline')"
                >
                    Decline
                </BaseButton>
                <BaseButton
                    data-testid="agent-permission-approve"
                    preset="signal"
                    :disabled="submitting"
                    @click="emit('resolve', 'approve')"
                >
                    Allow
                </BaseButton>
            </div>
        </div>
    </section>
</template>

<style scoped lang="scss">
.permission-title,
.permission-message {
    margin: 0;
}

.permission-required {
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

.permission-title {
    font-size: 1rem;
}

.permission-message {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.permission-controls {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
    margin-top: $space-3;
}

.permission-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
    margin-left: auto;
}

.confirmation-buttons {
    margin-top: $space-3;
}
</style>
