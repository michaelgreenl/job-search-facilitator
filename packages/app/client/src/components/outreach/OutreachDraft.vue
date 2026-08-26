<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import { computed, useId } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import ArrowUpIcon from '@/components/svgs/ArrowUpIcon.vue'
import CopyIcon from '@/components/svgs/CopyIcon.vue'
import SaveIcon from '@/components/svgs/SaveIcon.vue'

import OutreachContactCard from './OutreachContactCard.vue'

defineProps<{
    contact: OutreachContact
    assistantReply: string | null
    running: boolean
    requestingChanges: boolean
    copyState: 'idle' | 'copied' | 'failed'
    canSave: boolean
    saving: boolean
    expanded: boolean
    issue: string | null
    messagedError: string | null
    messagedUpdating: boolean
    reconnecting: boolean
}>()

const emit = defineEmits<{
    submit: []
    copy: []
    save: []
    updateMessaged: [messaged: boolean]
}>()

const draft = defineModel<string>('draft', { required: true })
const request = defineModel<string>('request', { required: true })
const canSubmit = computed(() => request.value.trim().length > 0)
const copyFeedbackId = useId()
</script>

<template>
    <section
        class="draft-board"
        data-testid="outreach-draft"
        :class="{ 'is-expanded': expanded }"
        aria-label="Outreach draft"
    >
        <OutreachContactCard
            class="draft-contact-card"
            :contact="contact"
            :expanded="expanded"
            :messaged-error="messagedError"
            :messaged-updating="messagedUpdating"
            show-messaged-control
            @update-messaged="emit('updateMessaged', $event)"
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
                    <div class="draft-actions">
                        <BaseButton
                            preset="icon"
                            tooltip="Save changes"
                            data-testid="save-outreach-draft"
                            aria-label="Save changes"
                            :aria-busy="saving || undefined"
                            :disabled="!canSave || saving"
                            @click="emit('save')"
                        >
                            <SaveIcon class="draft-action-icon" />
                        </BaseButton>
                        <BaseButton
                            preset="icon"
                            :tooltip="copyState === 'copied' ? 'Copied!' : 'Copy'"
                            :tooltip-open="copyState === 'copied'"
                            :aria-label="
                                copyState === 'copied'
                                    ? 'Outreach message copied'
                                    : 'Copy outreach message'
                            "
                            :aria-describedby="copyState === 'failed' ? copyFeedbackId : undefined"
                            :disabled="draft.trim().length === 0"
                            @click="emit('copy')"
                        >
                            <CopyIcon class="draft-action-icon" />
                        </BaseButton>
                        <span
                            :id="copyFeedbackId"
                            class="copy-feedback"
                            :class="{
                                'copy-feedback-copied': copyState === 'copied',
                                'copy-feedback-error': copyState === 'failed',
                            }"
                            :role="copyState === 'failed' ? 'alert' : 'status'"
                        >
                            <template v-if="copyState === 'copied'">Copied!</template>
                            <template v-else-if="copyState === 'failed'">
                                Could not copy draft
                            </template>
                        </span>
                    </div>
                </div>
            </div>

            <p v-if="assistantReply" class="assistant-reply" aria-live="polite">
                {{ assistantReply }}
            </p>
            <p
                v-if="reconnecting"
                class="draft-reconnect"
                data-testid="outreach-draft-reconnect"
                role="status"
            >
                Reconnecting to Agent…
            </p>
            <p v-if="issue" class="draft-issue" data-testid="outreach-draft-issue" role="alert">
                {{ issue }}
            </p>

            <form class="draft-request" @submit.prevent="emit('submit')">
                <div class="request-field">
                    <textarea
                        id="draft-request"
                        v-model="request"
                        class="text-field request-input"
                        data-testid="outreach-draft-request"
                        rows="1"
                        aria-label="Request draft changes"
                        :disabled="running"
                        placeholder="Request changes"
                        @keydown.enter.exact.prevent="emit('submit')"
                    ></textarea>
                    <BaseButton
                        class="field-action send-button"
                        type="submit"
                        data-testid="outreach-draft-submit"
                        aria-label="Send request"
                        :aria-busy="requestingChanges || undefined"
                        :disabled="running || !canSubmit"
                    >
                        <LoadingSpinner v-if="requestingChanges" class="send-spinner" />
                        <ArrowUpIcon v-else class="send-icon" />
                    </BaseButton>
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

.assistant-reply,
.draft-reconnect,
.draft-issue {
    margin: 0;
    font-size: 0.875rem;
}

.assistant-reply,
.draft-reconnect {
    color: $color-ink-secondary;
}

.draft-issue {
    color: lighten-color($color-red-600, 20%);
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
    flex-direction: column;
    gap: $space-1;
    min-height: 0;
}

.draft-textarea {
    flex: 1;
    width: 100%;
    min-height: 8rem;
    resize: none;
}

.field-action {
    position: absolute;

    &:disabled {
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

    &[aria-busy='true'] {
        cursor: wait;
        opacity: 1;
    }
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

.send-spinner {
    color: $color-white;
}

.draft-actions {
    position: relative;
    display: flex;
    gap: $space-1;
    align-self: flex-end;
}

.draft-action-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
}

.copy-feedback {
    position: absolute;
    right: 0;
    bottom: calc(100% + #{$space-1});
    min-height: 1rem;
    color: $color-ink-muted;
    font-size: 0.8125rem;

    &-copied {
        width: 1px;
        height: 1px;
        min-height: 0;
        padding: 0;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
        border: 0;
    }

    &-error {
        color: lighten-color($color-red-600, 20%);
    }
}
</style>
