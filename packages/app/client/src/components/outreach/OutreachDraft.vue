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
            <div class="request-field">
                <textarea
                    id="draft-request"
                    v-model="request"
                    class="text-field request-input"
                    rows="1"
                    aria-label="Request draft changes"
                    :disabled="running"
                    placeholder="Request changes"
                ></textarea>
                <button
                    class="field-action send-button"
                    type="submit"
                    :disabled="running || !canSubmit"
                >
                    Send
                </button>
            </div>
        </form>

        <p v-if="assistantReply" class="assistant-reply" aria-live="polite">
            {{ assistantReply }}
        </p>

        <div class="draft-content">
            <label class="field-label" for="outreach-message">Message</label>
            <div class="draft-field">
                <textarea
                    id="outreach-message"
                    v-model="draft"
                    class="text-field draft-textarea"
                    aria-label="Outreach message"
                    :disabled="running"
                ></textarea>
                <button
                    class="field-action copy-button"
                    type="button"
                    :aria-label="
                        copyState === 'copied' ? 'Outreach message copied' : 'Copy outreach message'
                    "
                    :disabled="draft.trim().length === 0"
                    @click="emit('copy')"
                >
                    <svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="9" y="9" width="11" height="11" rx="2" />
                        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
                    </svg>
                </button>
            </div>
            <span v-if="copyState === 'copied'" class="copy-status" role="status">Copied</span>
            <span v-if="copyState === 'failed'" class="copy-error" role="alert">
                Could not copy draft
            </span>
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
    display: block;
}

.request-field,
.draft-field {
    position: relative;
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
    width: 100%;
    padding-right: 5.25rem;
    resize: vertical;
}

.draft-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-2;
    min-height: 0;
}

.draft-field {
    display: flex;
    flex: 1;
    min-height: 0;
}

.draft-textarea {
    flex: 1;
    width: 100%;
    min-height: 8rem;
    padding-right: 3.25rem;
    padding-bottom: 3.25rem;
    resize: none;
}

.field-action {
    position: absolute;
    color: $color-night;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    background: $color-signal-light;
    border: 0;
    border-radius: $radius-sm;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
}

.send-button {
    top: 50%;
    right: $space-2;
    padding: $space-2 $space-3;
    transform: translateY(-50%);
}

.copy-button {
    right: $space-2;
    bottom: $space-2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
}

.copy-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
}

.copy-status,
.copy-error {
    font-size: 0.8125rem;
}

.copy-status {
    color: $color-ink-muted;
}

.copy-error {
    color: lighten-color($color-red-600, 20%);
}
</style>
