<script setup lang="ts">
import { computed } from 'vue'
import type { OutreachContact } from '@/work-tasks'

defineProps<{
    contact: OutreachContact
    assistantReply: string | null
    running: boolean
    copyState: 'idle' | 'copied' | 'failed'
}>()

const emit = defineEmits<{
    submit: []
    copy: []
}>()

const draft = defineModel<string>('draft', { required: true })
const request = defineModel<string>('request', { required: true })
const canSubmit = computed(() => request.value.trim().length > 0)
</script>

<template>
    <section class="draft-board" aria-label="Outreach draft">
        <div class="contact-card">
            <span class="eyebrow">Relevant contact</span>
            <a
                class="person-name"
                :href="contact.profileUrl"
                target="_blank"
                rel="noopener noreferrer"
            >
                {{ contact.personName }} ↗
            </a>
            <span class="person-title">{{ contact.personTitle }}</span>
            <p class="relevance-rationale">{{ contact.relevanceRationale }}</p>
        </div>

        <form class="draft-request" @submit.prevent="emit('submit')">
            <label class="field-label draft-request-label" for="draft-request">
                Ask for changes or ask a question
            </label>
            <textarea
                id="draft-request"
                v-model="request"
                class="text-field request-input"
                rows="2"
                :disabled="running"
            ></textarea>
            <button class="draft-button" type="submit" :disabled="running || !canSubmit">
                Send
            </button>
        </form>

        <p v-if="assistantReply" class="assistant-reply" aria-live="polite">
            {{ assistantReply }}
        </p>

        <label class="draft-content">
            <span class="field-label">Message draft</span>
            <textarea
                v-model="draft"
                class="text-field draft-textarea"
                aria-label="Outreach message"
                :disabled="running"
            ></textarea>
        </label>

        <div class="draft-actions">
            <span v-if="copyState === 'failed'" class="copy-error" role="alert">
                Could not copy draft
            </span>
            <button
                class="draft-button"
                type="button"
                :disabled="draft.trim().length === 0"
                @click="emit('copy')"
            >
                {{ copyState === 'copied' ? 'Copied' : 'Copy draft' }}
            </button>
        </div>
    </section>
</template>

<style scoped lang="scss">
.draft-board {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.contact-card {
    display: grid;
    gap: $space-1;
    padding: $space-3;
    background: rgb(245 241 251 / 5%);
    border: 1px solid rgb(221 199 255 / 18%);
    border-radius: $radius-md;
}

.eyebrow,
.field-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.person-name {
    width: fit-content;
    color: $color-ink;
    font-size: 1.125rem;
    font-weight: 700;
    text-decoration: none;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }
}

.person-title,
.relevance-rationale,
.assistant-reply {
    color: $color-ink-secondary;
}

.relevance-rationale,
.assistant-reply {
    margin: 0;
    font-size: 0.875rem;
}

.draft-request {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: $space-2;
}

.draft-request-label {
    grid-column: 1 / -1;
}

.text-field {
    padding: $space-3;
    color: $color-ink;
    font: inherit;
    background: rgb(245 241 251 / 6%);
    border: 1px solid rgb(245 241 251 / 16%);
    border-radius: $radius-md;

    &:focus {
        border-color: $color-signal;
    }

    &:disabled {
        opacity: 0.55;
    }
}

.request-input {
    resize: vertical;
}

.draft-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-2;
    min-height: 0;
}

.draft-textarea {
    flex: 1;
    min-height: 8rem;
    resize: none;
}

.draft-actions {
    display: flex;
    gap: $space-3;
    align-items: center;
    justify-content: flex-end;
}

.draft-button {
    padding: $space-2 $space-3;
    color: $color-night;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    background: $color-signal-light;
    border: 0;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
}

.copy-error {
    color: lighten-color($color-red-600, 20%);
    font-size: 0.8125rem;
}
</style>
