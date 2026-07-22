<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import { computed, shallowRef, useId, watch } from 'vue'
import ArrowUpIcon from '@/components/svgs/ArrowUpIcon.vue'
import CopyIcon from '@/components/svgs/CopyIcon.vue'

import OutreachContactCard from './OutreachContactCard.vue'

const props = withDefaults(
    defineProps<{
        contact?: OutreachContact | null
        contactLoading?: boolean
        assistantReply: string | null
        running: boolean
        copyState: 'idle' | 'copied' | 'failed'
        expanded: boolean
    }>(),
    {
        contact: null,
        contactLoading: false,
    },
)

const emit = defineEmits<{
    submit: []
    copy: []
}>()

const draft = defineModel<string>('draft', { required: true })
const request = defineModel<string>('request', { required: true })
const announceContactDiscovery = shallowRef(props.contactLoading)
const canSubmit = computed(() => request.value.trim().length > 0)
const copyFeedbackId = useId()

watch(
    () => props.contactLoading,
    (loading) => {
        if (loading) {
            announceContactDiscovery.value = true
        }
    },
)
</script>

<template>
    <section class="draft-board" :class="{ 'is-expanded': expanded }" aria-label="Outreach draft">
        <span
            v-if="announceContactDiscovery"
            class="draft-contact-announcement"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            {{
                contactLoading
                    ? 'Discovering contact…'
                    : contact
                      ? `Contact found: ${contact.personName}`
                      : ''
            }}
        </span>

        <OutreachContactCard
            class="draft-contact-card"
            :contact="contact ?? undefined"
            :expanded="expanded"
            :loading="contactLoading"
        />

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
                        :aria-describedby="copyState === 'copied' ? copyFeedbackId : undefined"
                        :disabled="draft.trim().length === 0"
                        @click="emit('copy')"
                    >
                        <CopyIcon class="copy-icon" />
                    </button>
                    <span
                        :id="copyFeedbackId"
                        class="copy-feedback"
                        :class="{
                            'copy-feedback-copied tooltip-surface': copyState === 'copied',
                            'copy-feedback-error': copyState === 'failed',
                        }"
                        :role="copyState === 'failed' ? 'alert' : 'status'"
                    >
                        <template v-if="copyState === 'copied'">Copied</template>
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
                        aria-label="Send request"
                        :disabled="running || !canSubmit"
                    >
                        <ArrowUpIcon class="send-icon" />
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

.draft-contact-announcement {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

.draft-contact-card {
    .draft-board.is-expanded & {
        @include bp-md-tablet {
            align-self: start;
        }
    }
}

.draft-workspace {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-3;
    min-height: 0;
}

.assistant-reply {
    margin: 0;
    color: $color-ink-secondary;
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
    min-width: 2.25rem;
    padding: $space-2 0;
    line-height: 1;
    transform: translateY(-50%);
}

.send-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
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
    bottom: 3.25rem;
    right: -0.4rem;
    min-height: 1rem;
    color: $color-ink-muted;
    font-size: 0.8125rem;

    &-copied {
        z-index: 1;
        min-height: 0;
        color: $color-ink;
        pointer-events: none;
    }

    &-error {
        color: lighten-color($color-red-600, 20%);
    }
}
</style>
