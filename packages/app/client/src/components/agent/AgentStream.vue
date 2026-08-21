<script setup lang="ts">
import type { AgentPermissionDecision, AgentTaskEvent } from '@job-search-facilitator/core'
import { computed, nextTick, useTemplateRef, watch, type Component } from 'vue'
import { useStickyBottomScroll } from '@/composables/useStickyBottomScroll'
import AgentIcon from '@/components/svgs/AgentIcon.vue'
import GlobeIcon from '@/components/svgs/GlobeIcon.vue'
import ToolIcon from '@/components/svgs/ToolIcon.vue'
import { useAgentStore } from '@/stores/agent'
import AgentPermissionPrompt from './AgentPermissionPrompt.vue'

const props = defineProps<{ issue: string | null; taskId: string | null }>()
const agentStore = useAgentStore()
const noEvents: AgentTaskEvent[] = []
const maxReasoningStatements = 6
const maxReasoningStatementLength = 60
const state = computed(() => (props.taskId === null ? null : agentStore.getTaskState(props.taskId)))
const events = computed(() => state.value?.events ?? noEvents)
const connectionState = computed(() => state.value?.connectionState ?? 'idle')
const pendingPermission = computed(() => state.value?.pendingPermission ?? null)
const permissionSubmitting = computed(() => state.value?.permissionSubmitting ?? false)
const isActive = computed(() => props.taskId !== null && agentStore.isTaskActive(props.taskId))
const permissionNeedsAttention = computed(
    () => pendingPermission.value !== null && !state.value?.alwaysAllowBrowserActions,
)

type StreamIcon = 'agent' | 'globe' | 'tool'

interface StreamItem {
    icon: StreamIcon
    message: string
    statements: string[]
    type: 'activity' | 'commentary'
}

const streamIcons: Record<StreamIcon, Component> = {
    agent: AgentIcon,
    globe: GlobeIcon,
    tool: ToolIcon,
}

const stripStatementMarkers = (message: string) =>
    message
        .split('\n')
        .map((statement) => statement.replace(/^(\s*)\*\*/, '$1').replace(/\*\*(\s*)$/, '$1'))
        .join('\n')

const reasoningStatements = (message: string) =>
    stripStatementMarkers(message)
        .split('\n')
        .filter((statement) => statement.trim().length > 0)

const limitReasoningStatement = (statement: string) =>
    statement.length > maxReasoningStatementLength
        ? `${statement.slice(0, maxReasoningStatementLength - 1).trimEnd()}…`
        : statement

const streamItems = computed(() => {
    const items = events.value.reduce<StreamItem[]>((currentItems, event) => {
        if (event.type === 'activity') {
            currentItems.push({
                message: event.message,
                icon:
                    event.message === 'Using Chrome' || event.message === 'Searching the web'
                        ? 'globe'
                        : 'tool',
                statements: [],
                type: 'activity',
            })
        } else if (event.type === 'message') {
            const lastItem = currentItems.at(-1)

            if (lastItem?.type === 'commentary') {
                if (event.startsNewStatement && lastItem.message) {
                    lastItem.message += '\n'
                }

                lastItem.message += event.textDelta
            } else if (event.textDelta) {
                currentItems.push({
                    icon: 'agent',
                    message: event.textDelta,
                    statements: [],
                    type: 'commentary',
                })
            }
        }

        return currentItems
    }, [])

    return items.map((item) =>
        item.type === 'commentary'
            ? {
                  ...item,
                  statements: reasoningStatements(item.message)
                      .slice(0, maxReasoningStatements)
                      .map(limitReasoningStatement),
              }
            : item,
    )
})
const latestActivityIndex = computed(() => {
    const items = streamItems.value

    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.type === 'activity') {
            return index
        }
    }

    return -1
})
const visiblePendingPermission = computed(() =>
    permissionNeedsAttention.value ? pendingPermission.value : null,
)
const scrollRevision = computed(() => [
    streamItems.value,
    visiblePendingPermission.value?.id ?? null,
    props.issue,
])
const progress = useTemplateRef<HTMLElement>('progress')
const issueMessage = useTemplateRef<HTMLElement>('issueMessage')
const { followingLatest, handleScroll, resetFollowing } = useStickyBottomScroll(
    progress,
    scrollRevision,
)

watch(
    () => events.value.length,
    (eventCount) => {
        if (eventCount === 0) {
            resetFollowing()
        }
    },
)

watch(
    () => props.issue,
    (issue) => {
        if (issue !== null) {
            void nextTick(() => issueMessage.value?.focus())
        }
    },
    { immediate: true },
)

function resolvePermission(decision: AgentPermissionDecision) {
    if (props.taskId !== null) {
        void agentStore.resolvePermission(props.taskId, decision).catch(() => undefined)
    }
}

function allowBrowserActionsForTask() {
    if (props.taskId !== null) {
        void agentStore.allowBrowserActionsForTask(props.taskId).catch(() => undefined)
    }
}
</script>

<template>
    <div class="agent-updates">
        <p v-if="issue" ref="issueMessage" class="agent-error" role="alert" tabindex="-1">
            {{ issue }}
        </p>
        <p
            v-if="connectionState === 'reconnecting'"
            class="agent-reconnect"
            data-testid="agent-reconnect-status"
            role="status"
        >
            Reconnecting to Agent…
        </p>

        <div
            ref="progress"
            data-testid="agent-progress"
            class="agent-progress"
            :class="{ 'agent-progress-following': followingLatest }"
            @scroll.passive="handleScroll"
        >
            <ul
                v-if="streamItems.length"
                class="activity-list"
                aria-label="Agent activity"
                aria-live="polite"
                :aria-busy="isActive"
                role="log"
            >
                <li
                    v-for="(item, index) in streamItems"
                    :key="`${index}:${item.type}`"
                    :data-testid="`agent-stream-${item.type}`"
                    class="activity-item"
                    :class="{ 'activity-item-commentary': item.type === 'commentary' }"
                >
                    <template v-if="item.type === 'activity'">
                        <span
                            v-if="
                                isActive &&
                                visiblePendingPermission === null &&
                                index === latestActivityIndex
                            "
                            data-testid="agent-progress-indicator"
                            class="activity-progress"
                            aria-hidden="true"
                        ></span>
                        <component v-else :is="streamIcons[item.icon]" class="activity-icon" />
                        <span data-testid="agent-stream-copy" class="activity-copy">
                            {{ item.message }}
                        </span>
                    </template>
                    <component
                        :is="item.statements.length > 1 ? 'details' : 'div'"
                        v-else
                        class="reasoning-details"
                    >
                        <component
                            :is="item.statements.length > 1 ? 'summary' : 'div'"
                            class="reasoning-summary"
                            :class="{
                                'reasoning-summary-collapsible': item.statements.length > 1,
                            }"
                            :data-testid="
                                item.statements.length > 1 ? 'agent-reasoning-toggle' : undefined
                            "
                        >
                            <AgentIcon
                                v-if="item.statements.length > 1"
                                class="activity-icon reasoning-chevron"
                            />
                            <span data-testid="agent-reasoning-trace" class="activity-copy">
                                {{ item.statements[0] }}
                            </span>
                        </component>
                        <div v-if="item.statements.length > 1" class="reasoning-traces">
                            <span
                                v-for="(statement, statementIndex) in item.statements.slice(1)"
                                :key="statementIndex"
                                data-testid="agent-reasoning-trace"
                                class="activity-copy"
                            >
                                {{ statement }}
                            </span>
                        </div>
                    </component>
                </li>
            </ul>
        </div>
    </div>

    <AgentPermissionPrompt
        v-if="visiblePendingPermission"
        :permission="visiblePendingPermission"
        :submitting="permissionSubmitting"
        @always-allow="allowBrowserActionsForTask"
        @resolve="resolvePermission"
    />
</template>

<style scoped lang="scss">
.agent-updates {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
}

.agent-error {
    margin: 0;
    color: lighten-color($color-red-600, 20%);
}

.agent-reconnect {
    margin: 0;
    color: $color-ink-muted;
    font-size: 0.875rem;
}

.agent-progress {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;

    &-following {
        scrollbar-width: none;

        &::-webkit-scrollbar {
            display: none;
        }
    }
}

.activity-list {
    display: flex;
    flex-direction: column;
    gap: $space-2;
    margin: auto 0 0;
    padding: 0;
    color: $color-ink-muted;
    font-size: 0.875rem;
    list-style: none;
}

.activity-item {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    column-gap: $space-2;
    align-items: center;

    &-commentary {
        display: block;
        color: $color-ink-secondary;
    }
}

.activity-copy {
    min-width: 0;
    line-height: 1.25;
    white-space: pre-line;
}

.reasoning-details {
    min-width: 0;
}

.reasoning-summary {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    column-gap: $space-2;
    align-items: center;
    color: inherit;
    list-style: none;

    &::-webkit-details-marker {
        display: none;
    }

    &::marker {
        content: '';
    }

    > .activity-copy {
        grid-column: 2;
    }

    &-collapsible {
        cursor: pointer;
        transition: color 140ms ease;

        &:hover,
        &:focus-visible {
            color: $color-ink;
        }

        &:active {
            color: $color-signal-light;
        }
    }
}

.reasoning-details[open] > .reasoning-summary {
    color: $color-ink;
}

.reasoning-chevron {
    transition: transform 160ms ease;

    .reasoning-details[open] & {
        transform: rotate(90deg);
    }
}

.reasoning-traces {
    display: grid;
    gap: $space-2;
    margin: $space-1 0 $space-1 1rem;
    padding: $space-1 0 $space-1 $space-2;
    border-left: 1px solid $color-signal-alpha-24;
}

.activity-icon {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.2;
}

.activity-progress {
    display: grid;
    width: 1rem;
    height: 1rem;
    overflow: hidden;
    color: $color-signal-light;
    font-family: $font-family-mono;
    line-height: 1;
    place-items: center;

    &::after {
        content: '⠋';
        animation: activity-spin 0.8s step-end infinite;
    }
}

@keyframes activity-spin {
    0% {
        content: '⠋';
    }

    10% {
        content: '⠙';
    }

    20% {
        content: '⠹';
    }

    30% {
        content: '⠸';
    }

    40% {
        content: '⠼';
    }

    50% {
        content: '⠴';
    }

    60% {
        content: '⠦';
    }

    70% {
        content: '⠧';
    }

    80% {
        content: '⠇';
    }

    90%,
    100% {
        content: '⠏';
    }
}
</style>
