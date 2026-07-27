<script setup lang="ts">
import { shallowRef } from 'vue'
import PanelHeading from '@/components/layout/PanelHeading.vue'

defineProps<{
    busy: boolean
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
    retry: []
    submit: [url: string]
}>()

const url = shallowRef('')
const urlError = shallowRef<string | null>(null)

function submit() {
    const value = url.value.trim()

    try {
        const parsedUrl = new URL(value)

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error()
        }

        urlError.value = null
        emit('submit', parsedUrl.href)
    } catch {
        urlError.value = 'Enter a valid http or https job-post URL.'
    }
}
</script>

<template>
    <PanelHeading
        eyebrow="Job post import"
        title="Add job post"
        back-label="Back to review sources"
        back-test-id="back-from-job-post-import"
        @back="emit('back')"
    />

    <form class="import-form" novalidate @submit.prevent="submit">
        <label class="url-label" for="job-post-url">Job-post URL</label>
        <input
            id="job-post-url"
            v-model="url"
            class="url-input"
            data-testid="job-post-url"
            type="url"
            inputmode="url"
            autocomplete="url"
            :aria-describedby="urlError ? 'job-post-url-error' : undefined"
            :aria-invalid="urlError !== null"
            :disabled="busy"
        />
        <p
            v-if="urlError"
            id="job-post-url-error"
            class="form-error"
            data-testid="job-post-url-error"
            role="alert"
        >
            {{ urlError }}
        </p>

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
                :disabled="busy"
                @click="emit('retry')"
            >
                Try again
            </button>
            <button
                class="action-button action-button-primary"
                data-testid="start-job-post-import"
                type="submit"
                :disabled="busy"
            >
                Add job post
            </button>
        </div>
    </form>

    <p v-if="saving" class="save-status" data-testid="job-post-save-status" role="status">
        Saving job post…
    </p>
    <p v-else-if="starting" class="save-status" data-testid="job-post-start-status" role="status">
        Starting Work…
    </p>
    <p v-if="issue" class="form-error" data-testid="job-post-import-error" role="alert">
        {{ issue }}
    </p>
</template>

<style scoped lang="scss">
.import-form {
    display: grid;
    gap: $space-2;
}

.url-label {
    color: $color-ink-secondary;
    font-size: 0.875rem;
    font-weight: 650;
}

.url-input {
    width: 100%;
    padding: $space-3;
    color: $color-ink;
    font: inherit;
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;

    &:focus-visible {
        border-color: $color-signal-light;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }
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
    justify-content: flex-end;
    margin-top: $space-2;
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
