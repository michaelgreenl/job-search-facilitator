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

const streamItems = computed(() => {
    const items = events.value.reduce<StreamItem[]>((currentItems, event) => {
        if (event.type === 'activity') {
            currentItems.push({
                message: event.message,
                icon:
                    event.message === 'Using Chrome' || event.message === 'Searching the web'
                        ? 'globe'
                        : 'tool',
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
                    type: 'commentary',
                })
            }
        }

        return currentItems
    }, [])

    return items.map((item) =>
        item.type === 'commentary'
            ? { ...item, message: stripStatementMarkers(item.message) }
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
        color: $color-ink-secondary;
    }
}

.activity-icon {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
}

.activity-copy {
    min-width: 0;
    line-height: 1.25;
    white-space: pre-line;
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
