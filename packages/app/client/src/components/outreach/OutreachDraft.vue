<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import { computed, useId, useTemplateRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import ArrowUpIcon from '@/components/svgs/ArrowUpIcon.vue'
import CopyIcon from '@/components/svgs/CopyIcon.vue'
import SaveIcon from '@/components/svgs/SaveIcon.vue'
import { useStickyBottomScroll } from '@/composables/useStickyBottomScroll'
import type { DraftExchange } from '@/services/outreach-conversation'

import OutreachContactCard from './OutreachContactCard.vue'

const props = defineProps<{
    contact: OutreachContact
    exchanges: DraftExchange[]
    pendingRequest?: string | null
    retryAvailable?: boolean
    cancelling?: boolean
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
    useDraft: [taskId: string]
    newConversation: []
    retry: []
    cancel: []
}>()

const draft = defineModel<string>('draft', { required: true })
const request = defineModel<string>('request', { required: true })
const canSubmit = computed(() => request.value.trim().length > 0)
const copyFeedbackId = useId()
const conversationLog = useTemplateRef<HTMLElement>('conversationLog')
const { handleScroll } = useStickyBottomScroll(conversationLog, () => [
    props.exchanges,
    props.pendingRequest,
    props.running,
])

function submit() {
    if (!props.running && canSubmit.value) emit('submit')
}
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
                <label class="eyebrow" for="outreach-message">Current draft</label>
                <div class="draft-field">
                    <textarea
                        id="outreach-message"
                        v-model="draft"
                        class="text-field draft-textarea"
                        aria-label="Outreach message"
                        data-testid="outreach-message"
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

            <div class="conversation-pane">
                <div class="conversation-heading">
                    <span class="eyebrow">Conversation</span>
                    <BaseButton
                        preset="text"
                        data-testid="outreach-new-conversation"
                        :disabled="running || (exchanges.length === 0 && !pendingRequest && !issue)"
                        @click="emit('newConversation')"
                        >New conversation</BaseButton
                    >
                </div>
                <div
                    ref="conversationLog"
                    class="conversation-log"
                    data-testid="outreach-conversation"
                    role="log"
                    aria-label="Draft conversation"
                    aria-live="polite"
                    tabindex="0"
                    @scroll="handleScroll"
                >
                    <p v-if="exchanges.length === 0 && !pendingRequest" class="conversation-empty">
                        Shape this message together. Ask a question, request a change, or paste
                        their reply to draft a response.
                    </p>
                    <article
                        v-for="exchange in exchanges"
                        :key="exchange.taskId"
                        class="conversation-exchange"
                    >
                        <p class="conversation-request">
                            <span class="message-author">You</span>{{ exchange.request }}
                        </p>
                        <div class="conversation-response">
                            <span class="message-author">Agent</span>
                            <p>{{ exchange.response }}</p>
                            <div v-if="exchange.draft" class="proposed-draft">
                                <span class="eyebrow">Proposed draft</span>
                                <p>{{ exchange.draft }}</p>
                                <BaseButton
                                    preset="outline"
                                    :data-testid="`use-outreach-draft-${exchange.taskId}`"
                                    :disabled="exchange.draft === draft"
                                    @click="emit('useDraft', exchange.taskId)"
                                    >{{
                                        exchange.draft === draft ? 'In editor' : 'Use this draft'
                                    }}</BaseButton
                                >
                            </div>
                        </div>
                    </article>
                    <p v-if="pendingRequest" class="conversation-request">
                        <span class="message-author">You</span>{{ pendingRequest }}
                    </p>
                    <p v-if="running && !reconnecting" class="draft-reconnect" role="status">
                        Working on your request…
                    </p>
                </div>
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
                <div v-if="retryAvailable || running" class="conversation-actions">
                    <BaseButton
                        v-if="retryAvailable"
                        preset="outline"
                        data-testid="outreach-draft-retry"
                        @click="emit('retry')"
                        >Retry request</BaseButton
                    >
                    <BaseButton
                        v-if="running"
                        preset="text"
                        data-testid="outreach-draft-stop"
                        :disabled="cancelling"
                        @click="emit('cancel')"
                        >{{ cancelling ? 'Stopping…' : 'Stop' }}</BaseButton
                    >
                </div>

                <form class="draft-request" @submit.prevent="submit">
                    <div class="request-field">
                        <textarea
                            id="draft-request"
                            v-model="request"
                            class="text-field request-input"
                            data-testid="outreach-draft-request"
                            rows="2"
                            aria-label="Message the draft assistant"
                            placeholder="Ask, revise, or paste a reply…"
                            @keydown.enter.exact.prevent="submit"
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
    overflow: auto;

    &.is-expanded {
        @include bp-md-tablet {
            display: grid;
            grid-template-columns: minmax(12rem, 0.65fr) minmax(0, 2fr);
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
    min-width: 0;
}

.draft-reconnect,
.draft-issue {
    margin: 0;
    font-size: 0.875rem;
}

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
    flex: 0 0 auto;
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
    min-height: 6rem;
    height: 22vh;
    max-height: 18rem;
    resize: none;
}

.conversation-pane {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-3;
    min-height: 12rem;
}

.conversation-heading,
.conversation-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    align-items: center;
    justify-content: space-between;
}

.conversation-log {
    flex: 1;
    min-height: 5rem;
    padding: $space-1;
    overflow: auto;
    overscroll-behavior: contain;
    font-size: 0.875rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
    border-radius: $radius-md;

    p {
        margin: 0;
        white-space: pre-wrap;
    }
}

.conversation-empty {
    color: $color-ink-muted;
}

.conversation-exchange {
    margin-bottom: $space-4;
}

.message-author {
    display: block;
    margin-bottom: $space-1;
    color: $color-ink-muted;
    font-size: 0.75rem;
    font-weight: 600;
}

.conversation-request {
    padding: $space-3;
    background: $color-ink-alpha-6;
    border-radius: $radius-md;
}

.conversation-response {
    padding: $space-3 $space-1 0;
}

.proposed-draft {
    display: flex;
    flex-direction: column;
    gap: $space-3;
    align-items: flex-start;
    margin-top: $space-3;
    padding: $space-3;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;
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
