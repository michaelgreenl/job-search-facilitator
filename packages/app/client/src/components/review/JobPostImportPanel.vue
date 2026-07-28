<script setup lang="ts">
import PanelHeading from '@/components/layout/PanelHeading.vue'

defineProps<{
    backAvailable: boolean
    canDismiss: boolean
    cancelling: boolean
    issue: string | null
    retryAvailable: boolean
    running: boolean
    saving: boolean
    starting: boolean
}>()

const emit = defineEmits<{
    back: []
    cancel: []
    dismiss: []
    retry: []
}>()
</script>

<template>
    <section class="job-post-import-panel">
        <PanelHeading
            eyebrow="Job post import"
            title="Add job post"
            :back-label="backAvailable ? 'Back to added job posts' : undefined"
            back-test-id="back-from-job-post-import"
            @back="emit('back')"
        />

        <p v-if="saving" class="save-status" data-testid="job-post-save-status" role="status">
            Saving job post…
        </p>
        <p
            v-else-if="starting"
            class="save-status"
            data-testid="job-post-start-status"
            role="status"
        >
            Starting Work…
        </p>
        <p v-if="issue" class="form-error" data-testid="job-post-import-error" role="alert">
            {{ issue }}
        </p>

        <slot />

        <div class="form-actions">
            <button
                v-if="running"
                class="action-button"
                data-testid="cancel-job-post-import"
                type="button"
                :disabled="cancelling"
                @click="emit('cancel')"
            >
                {{ cancelling ? 'Cancelling…' : 'Cancel import' }}
            </button>
            <button
                v-else-if="retryAvailable"
                class="action-button"
                data-testid="retry-job-post-import"
                type="button"
                @click="emit('retry')"
            >
                Try again
            </button>
            <button
                v-if="canDismiss"
                class="action-button"
                data-testid="dismiss-job-post-import"
                type="button"
                @click="emit('dismiss')"
            >
                Dismiss
            </button>
        </div>
    </section>
</template>

<style scoped lang="scss">
.job-post-import-panel {
    display: flex;
    flex-direction: column;
    gap: $space-4;
    height: 100%;
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
    padding: 0;
    color: $color-signal-light;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.5;
    }
}
</style>
