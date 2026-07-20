<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { OutreachContact } from '@/work-tasks'

const props = defineProps<{
    contact: OutreachContact
    assistantReply: string | null
    running: boolean
    copyState: 'idle' | 'copied' | 'failed'
    expanded: boolean
}>()

const emit = defineEmits<{
    submit: []
    copy: []
}>()

const draft = defineModel<string>('draft', { required: true })
const request = defineModel<string>('request', { required: true })
const canSubmit = computed(() => request.value.trim().length > 0)
const descriptionExpanded = shallowRef(false)
const rationaleExpanded = computed(() => props.expanded || descriptionExpanded.value)

watch([() => props.contact.profileUrl, () => props.expanded], () => {
    descriptionExpanded.value = false
})
</script>

<template>
    <section class="draft-board" :class="{ 'is-expanded': expanded }" aria-label="Outreach draft">
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
            <div class="rationale-copy">
                <p
                    id="contact-rationale"
                    class="relevance-rationale"
                    :class="{ 'is-clamped': !rationaleExpanded }"
                >
                    {{ contact.relevanceRationale }}
                </p>
                <button
                    v-if="!expanded"
                    class="rationale-toggle"
                    :class="{ 'rationale-toggle-more': !descriptionExpanded }"
                    type="button"
                    aria-controls="contact-rationale"
                    :aria-expanded="descriptionExpanded"
                    @click="descriptionExpanded = !descriptionExpanded"
                >
                    {{ descriptionExpanded ? 'Show less' : 'Show more' }}
                </button>
            </div>
        </div>

        <div class="draft-workspace">
            <div class="draft-content">
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
                            copyState === 'copied'
                                ? 'Outreach message copied'
                                : 'Copy outreach message'
                        "
                        :disabled="draft.trim().length === 0"
                        @click="emit('copy')"
                    >
                        <svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
                        </svg>
                    </button>
                    <span
                        class="copy-feedback"
                        :class="{ 'copy-feedback-error': copyState === 'failed' }"
                        :role="copyState === 'failed' ? 'alert' : 'status'"
                    >
                        <template v-if="copyState === 'copied'">Copied!</template>
                        <template v-else-if="copyState === 'failed'">Could not copy draft</template>
                    </span>
                </div>
            </div>

            <p v-if="assistantReply" class="assistant-reply" aria-live="polite">
                {{ assistantReply }}
            </p>

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

    &.is-expanded {
        @include bp-md-tablet {
            display: grid;
            grid-template-columns: minmax(12rem, 0.7fr) minmax(0, 1.8fr);
            align-items: stretch;
        }
    }
}

.contact-card {
    display: grid;
    gap: $space-1;
    padding: $space-3;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;

    .draft-board.is-expanded & {
        @include bp-md-tablet {
            align-self: start;
        }
    }
}

.eyebrow {
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

.draft-workspace {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-3;
    min-height: 0;
}

.relevance-rationale,
.assistant-reply {
    margin: 0;
    font-size: 0.875rem;
}

.rationale-copy {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.relevance-rationale.is-clamped {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
}

.rationale-toggle {
    width: fit-content;
    padding-right: $space-1;
    color: $color-signal-light;
    margin-left: auto;
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }

    &-more {
        // position: absolute;
        // right: 0;
        // bottom: 0;
        // margin-top: 0;
        // background: linear-gradient(90deg, transparent, $color-night-panel 30%);
    }
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
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;

    &:focus {
        border-color: $color-signal;
    }

    &:disabled {
        opacity: 0.55;
    }
}

.request-input {
    display: block;
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
    color: $color-ink;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    background: $color-action;
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

.send-button {
    top: 50%;
    right: $space-2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 4rem;
    padding: $space-2 $space-3;
    line-height: 1;
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

.copy-feedback {
    position: absolute;
    bottom: 3rem;
    right: 0.2rem;
    min-height: 1rem;
    color: $color-ink-muted;
    font-size: 0.8125rem;

    &-error {
        color: lighten-color($color-red-600, 20%);
    }
}
</style>
