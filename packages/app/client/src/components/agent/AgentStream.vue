<script setup lang="ts">
import type { AgentPermissionDecision, AgentTaskEvent } from '@job-search-facilitator/core'
import { computed, nextTick, useTemplateRef, watch, type Component } from 'vue'
import { useStickyBottomScroll } from '@/composables/useStickyBottomScroll'
import AgentIcon from '@/components/svgs/AgentIcon.vue'
import ChevronDownIcon from '@/components/svgs/ChevronDownIcon.vue'
import GlobeIcon from '@/components/svgs/GlobeIcon.vue'
import ToolIcon from '@/components/svgs/ToolIcon.vue'
import { useAgentStore } from '@/stores/agent'
import AgentPermissionPrompt from './AgentPermissionPrompt.vue'

const props = defineProps<{
    issue: string | null
    taskId: string | null
    statusMessage?: string | null
    statusTestId?: string
}>()
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

interface StreamBlock {
    icon: StreamIcon
    activity: string | null
    startup: string | null
    statements: string[]
}

const streamIcons: Record<StreamIcon, Component> = {
    agent: AgentIcon,
    globe: GlobeIcon,
    tool: ToolIcon,
}

const streamItems = computed(() => {
    const items: StreamBlock[] = []
    const newBlock = (): StreamBlock => ({
        icon: 'agent',
        activity: null,
        startup: null,
        statements: [],
    })

    if (props.statusMessage === 'Starting Agent…') {
        items.push({ ...newBlock(), startup: props.statusMessage })
    }

    for (const event of events.value) {
        if (event.type !== 'activity' && event.type !== 'message') continue
        let block = items.at(-1)

        if (event.type === 'activity' && event.message === 'Task started') {
            if (block === undefined) items.push(newBlock())
            items[0]!.startup = event.message
            continue
        }

        if (event.type === 'activity') {
            if (block?.activity === event.message) continue
            // A tool change without an update belongs to the current block.
            if (block?.statements.length === 0 && items.at(-2)?.activity === event.message) {
                items.pop()
                continue
            }
            if (block === undefined || block.statements.length > 0) {
                block = newBlock()
                items.push(block)
            }
            block.activity = event.message
            block.icon =
                event.message === 'Using Chrome' || event.message === 'Searching the web'
                    ? 'globe'
                    : 'tool'
        } else if (event.textDelta) {
            if (block === undefined) {
                block = newBlock()
                items.push(block)
            }
            if (event.startsNewStatement || block.statements.length === 0) {
                block.statements.push(event.textDelta)
            } else {
                block.statements[block.statements.length - 1] += event.textDelta
            }
        }
    }

    return items.map((item) => {
        const statements = [...new Set([...item.statements].reverse())]
        return { ...item, statements }
    })
})
const latestActivityIndex = computed(() => {
    const items = streamItems.value

    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.activity !== null) {
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
    props.statusMessage,
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
            <div class="progress-content">
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
                        :key="index"
                        class="stream-block"
                        data-testid="agent-stream-block"
                    >
                        <div
                            v-if="item.startup"
                            class="activity-item"
                            :data-testid="
                                item.startup === props.statusMessage
                                    ? props.statusTestId
                                    : undefined
                            "
                        >
                            <span
                                v-if="
                                    isActive &&
                                    latestActivityIndex === -1 &&
                                    visiblePendingPermission === null
                                "
                                data-testid="agent-progress-indicator"
                                class="activity-progress"
                                aria-hidden="true"
                            ></span>
                            <ToolIcon v-else class="activity-icon" />
                            <span class="activity-copy">{{ item.startup }}</span>
                        </div>
                        <div
                            v-if="item.activity"
                            class="activity-item"
                            data-testid="agent-stream-activity"
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
                                {{ item.activity }}
                            </span>
                        </div>
                        <component
                            v-if="item.statements.length"
                            :is="item.statements.length > 1 ? 'details' : 'div'"
                            class="reasoning-details activity-item-commentary"
                            data-testid="agent-stream-commentary"
                        >
                            <component
                                :is="item.statements.length > 1 ? 'summary' : 'div'"
                                class="reasoning-summary"
                                :class="{
                                    'reasoning-summary-collapsible': item.statements.length > 1,
                                }"
                                :data-testid="
                                    item.statements.length > 1
                                        ? 'agent-reasoning-toggle'
                                        : undefined
                                "
                            >
                                <span data-testid="agent-reasoning-latest" class="activity-copy">
                                    {{ item.statements[0] }}
                                </span>
                                <ChevronDownIcon
                                    v-if="item.statements.length > 1"
                                    class="activity-icon reasoning-chevron"
                                />
                            </component>
                            <div v-if="item.statements.length > 1" class="reasoning-traces">
                                <span
                                    v-for="statement in item.statements.slice(1)"
                                    :key="statement"
                                    data-testid="agent-reasoning-trace"
                                    class="activity-copy"
                                >
                                    {{ statement }}
                                </span>
                            </div>
                        </component>
                    </li>
                </ul>
                <p
                    v-if="props.statusMessage && props.statusMessage !== 'Starting Agent…'"
                    class="task-status"
                    :data-testid="props.statusTestId"
                    role="status"
                >
                    {{ props.statusMessage }}
                </p>
            </div>
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

.progress-content {
    margin-top: auto;
}

.task-status {
    margin: $space-2 0 0;
    color: $color-ink-muted;
    font-size: 0.875rem;
}

.activity-list {
    display: flex;
    flex-direction: column;
    gap: $space-2;
    margin: 0;
    padding: 0;
    color: $color-ink-muted;
    font-size: 0.875rem;
    list-style: none;
}

.stream-block {
    display: flex;
    flex-direction: column;
    gap: $space-2;
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
    overflow-wrap: anywhere;
}

.reasoning-details {
    min-width: 0;
}

.reasoning-summary {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    max-width: calc(100% - 1rem - $space-2);
    margin-left: calc(1rem + $space-2);
    color: inherit;
    cursor: default;
    list-style: none;

    &::-webkit-details-marker {
        display: none;
    }

    &::marker {
        content: '';
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
    opacity: 0.65;
    transform: rotate(-90deg);
    transition:
        opacity 140ms ease,
        transform 160ms ease;

    .reasoning-summary-collapsible:is(:hover, :focus-visible) & {
        opacity: 1;
    }

    .reasoning-details[open] & {
        opacity: 1;
        transform: rotate(0);
    }
}

.reasoning-traces {
    display: grid;
    gap: $space-1;
    margin: $space-1 0 $space-1 0.5rem;
    padding: $space-1 0 $space-1 calc($space-2 + 0.5rem);
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
