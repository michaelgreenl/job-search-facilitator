<script lang="ts">
export interface OutreachTaskListItem {
    taskId: string
    kind: 'contact' | 'draft'
    active: boolean
    permissionRequired: boolean
    status:
        | 'starting'
        | 'restoring'
        | 'running'
        | 'completed'
        | 'failed'
        | 'cancelled'
        | 'unavailable'
}
</script>

<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import { useDescriptionOverflow } from '@/composables/useDescriptionOverflow'

const props = withDefaults(
    defineProps<{
        contact?: OutreachContact
        expanded?: boolean
        messagedError?: string | null
        messagedUpdating?: boolean
        selectable?: boolean
        showMessagedControl?: boolean
        showMessagedStatus?: boolean
        task?: OutreachTaskListItem
    }>(),
    {
        contact: undefined,
        expanded: false,
        messagedError: null,
        messagedUpdating: false,
        selectable: false,
        showMessagedControl: false,
        showMessagedStatus: true,
        task: undefined,
    },
)

const emit = defineEmits<{
    select: []
    updateMessaged: [messaged: boolean]
}>()

defineSlots<{
    actions?: (props: { contact: OutreachContact }) => unknown
}>()

const selectionLabel = computed(() => {
    if (!props.selectable) {
        return null
    }

    if (props.task !== undefined) {
        return 'Open outreach task'
    }

    return props.contact ? `Open outreach draft for ${props.contact.personName}` : null
})
const taskMessage = computed(() => {
    if (props.task?.status === 'starting') {
        return 'Starting Agent…'
    }

    if (props.task?.status === 'restoring') {
        return 'Restoring Agent…'
    }

    if (props.task?.status === 'running') {
        return props.task.kind === 'draft' ? 'Revising outreach…' : 'Discovering contact…'
    }

    if (props.task?.status === 'completed') {
        return props.task.kind === 'draft' ? 'Draft ready' : 'Saving contact…'
    }

    return 'Outreach needs attention'
})
const {
    descriptionElement,
    descriptionId,
    expanded: descriptionExpanded,
    showToggle: showDescriptionToggle,
    toggleExpanded: toggleDescription,
    userExpanded: descriptionUserExpanded,
} = useDescriptionOverflow(
    () => props.contact?.relevanceRationale ?? '',
    () => props.expanded,
)

function toggleMessaged() {
    if (props.contact) {
        emit('updateMessaged', !props.contact.messaged)
    }
}
</script>

<template>
    <BaseCard
        class="contact-card"
        tone="signal"
        :data-testid="
            contact
                ? `outreach-contact-${contact.id}`
                : task
                  ? `outreach-task-${task.taskId}`
                  : undefined
        "
        :interactive="selectionLabel !== null"
        :aria-busy="task?.active || messagedUpdating || undefined"
    >
        <button
            v-if="selectionLabel"
            class="contact-select-button"
            type="button"
            :data-testid="
                contact
                    ? `outreach-contact-${contact.id}-select`
                    : task
                      ? `outreach-task-${task.taskId}-select`
                      : undefined
            "
            :aria-label="selectionLabel"
            @click="emit('select')"
        ></button>

        <template v-if="task">
            <span class="eyebrow">
                {{ task.kind === 'draft' ? 'Outreach draft' : 'Relevant contact' }}
            </span>
            <span class="loading-contact">
                <LoadingSpinner v-if="task.active" />
                {{ taskMessage }}
            </span>
            <span
                v-if="task.permissionRequired"
                class="task-permission-notice"
                :data-testid="`outreach-task-${task.taskId}-permission-needed`"
                role="status"
            >
                Permission needed — open task to continue
            </span>
        </template>

        <template v-else-if="contact">
            <div class="contact-labels">
                <span class="eyebrow">Relevant contact</span>
                <button
                    v-if="showMessagedControl"
                    class="messaged-status-button"
                    data-testid="outreach-contact-messaged-toggle"
                    :class="{
                        'is-messaged': contact.messaged,
                        'is-updating': messagedUpdating,
                    }"
                    type="button"
                    :aria-pressed="contact.messaged"
                    :disabled="messagedUpdating"
                    @click="toggleMessaged"
                >
                    <LoadingSpinner v-if="messagedUpdating" class="messaged-spinner" />
                    <template v-if="messagedUpdating">Saving…</template>
                    <template v-else-if="contact.messaged">
                        <span aria-hidden="true">✓</span>
                        Messaged
                    </template>
                    <template v-else>Mark as messaged</template>
                </button>
                <span
                    v-else-if="showMessagedStatus && contact.messaged"
                    class="messaged-status"
                    data-testid="outreach-contact-messaged-status"
                >
                    Messaged
                </span>
                <div v-if="$slots.actions" class="contact-actions">
                    <slot name="actions" :contact="contact" />
                </div>
            </div>
            <p v-if="showMessagedControl && messagedError" class="messaged-error" role="alert">
                {{ messagedError }}
            </p>
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
                    :id="descriptionId"
                    ref="descriptionElement"
                    class="rationale-text"
                    data-testid="outreach-contact-rationale"
                    :class="{ 'is-clamped': !descriptionExpanded }"
                >
                    {{ contact.relevanceRationale }}
                </p>
                <div v-if="showDescriptionToggle" class="rationale-actions">
                    <BaseButton
                        class="rationale-toggle"
                        preset="text"
                        data-testid="outreach-contact-rationale-toggle"
                        :aria-controls="descriptionId"
                        :aria-expanded="descriptionUserExpanded"
                        @click="toggleDescription"
                    >
                        {{ descriptionUserExpanded ? 'Show less' : 'Show more' }}
                    </BaseButton>
                </div>
            </div>
        </template>
    </BaseCard>
</template>

<style scoped lang="scss">
.contact-card {
    position: relative;
    gap: $space-1;
    padding: $space-3;
}

.contact-select-button {
    position: absolute;
    z-index: 1;
    inset: 0;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: inherit;

    &:focus-visible {
        outline: 2px solid $color-signal-light;
        outline-offset: 2px;
    }
}

.contact-labels {
    display: flex;
    gap: $space-2;
    align-items: center;
    justify-content: space-between;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.messaged-status,
.messaged-status-button {
    display: inline-flex;
    width: fit-content;
    gap: $space-1;
    align-items: center;
    padding: $space-1 $space-2;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    line-height: 1.25;
    border-radius: $radius-full;
}

.messaged-status,
.messaged-status-button.is-messaged {
    color: lighten-color($color-green-600, 35%);
    background: $color-green-600-alpha-25;
    border: 1px solid $color-green-600-alpha-55;
}

.messaged-status-button {
    position: relative;
    z-index: 2;
    color: $color-ink-secondary;
    cursor: pointer;
    background: transparent;
    border: 1px solid $color-ink-alpha-50;

    &:not(.is-messaged):hover:not(:disabled) {
        color: $color-ink;
        border-color: $color-signal-light-alpha-50;
    }

    &.is-updating {
        cursor: wait;
        opacity: 0.7;
    }
}

.messaged-spinner {
    width: 0.6875rem;
    height: 0.6875rem;
    border-width: 1.5px;
}

.messaged-error {
    position: relative;
    z-index: 2;
    justify-self: end;
    max-width: 100%;
    margin: 0;
    color: lighten-color($color-red-600, 20%);
    font-size: 0.75rem;
    text-align: right;
}

.person-name {
    position: relative;
    z-index: 2;
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

.person-title {
    color: $color-ink-secondary;
}

.contact-actions {
    position: relative;
    z-index: 2;
    display: flex;
}

.rationale-copy {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.rationale-text {
    margin: 0;
    color: $color-ink-secondary;
    font-size: 0.875rem;

    &.is-clamped {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
    }
}

.rationale-actions {
    position: relative;
    z-index: 2;
    display: flex;
    gap: $space-2;
    align-items: center;
    min-width: 0;
    margin-top: $space-2;
}

.rationale-toggle {
    position: relative;
    z-index: 2;
    padding: 0 $space-1 0 0;
    margin-left: auto;
    font-size: 0.875rem;
}

.loading-contact {
    display: flex;
    gap: $space-2;
    align-items: center;
    min-height: 2rem;
    color: $color-ink-secondary;
}

.task-permission-notice {
    width: fit-content;
    padding: $space-1 $space-2;
    margin-top: $space-1;
    color: $color-amber-500;
    font-size: 0.75rem;
    font-weight: 650;
    background: $color-amber-500-alpha-12;
    border-radius: $radius-full;
}
</style>
