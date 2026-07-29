<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{
    canDismiss: boolean
    cancelling: boolean
    issue: string | null
    retryAvailable: boolean
    running: boolean
    saving: boolean
    starting: boolean
}>()

const emit = defineEmits<{
    cancel: []
    dismiss: []
    retry: []
}>()
</script>

<template>
    <section class="job-post-import-panel">
        <p v-if="saving" class="save-status" data-testid="job-post-save-status" role="status">
            Saving job post…
        </p>
        <p
            v-else-if="starting"
            class="save-status"
            data-testid="job-post-start-status"
            role="status"
        >
            Starting Agent…
        </p>
        <p v-if="issue" class="form-error" data-testid="job-post-import-error" role="alert">
            {{ issue }}
        </p>

        <slot />

        <div class="form-actions">
            <BaseButton
                v-if="running"
                class="action-button"
                data-testid="cancel-job-post-import"
                preset="text"
                :disabled="cancelling"
                @click="emit('cancel')"
            >
                {{ cancelling ? 'Cancelling…' : 'Cancel import' }}
            </BaseButton>
            <BaseButton
                v-else-if="retryAvailable"
                class="action-button"
                data-testid="retry-job-post-import"
                preset="text"
                @click="emit('retry')"
            >
                Try again
            </BaseButton>
            <BaseButton
                v-if="canDismiss"
                class="action-button"
                data-testid="dismiss-job-post-import"
                preset="text"
                @click="emit('dismiss')"
            >
                Dismiss
            </BaseButton>
        </div>
    </section>
</template>

<style scoped lang="scss">
.job-post-import-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
}

.form-error,
.save-status {
    margin: 0;
}

.form-error {
    color: lighten-color($color-red-600, 20%);
}

.save-status {
    color: $color-ink-muted;
}

.form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
}

.action-button {
    font-size: 0.8125rem;

    &:disabled {
        cursor: wait;
        opacity: 0.5;
    }
}
</style>
