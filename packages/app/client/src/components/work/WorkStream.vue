<script setup lang="ts">
import type { WorkActionDecision } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, useTemplateRef, watch, type Component } from 'vue'
import { useStickyBottomScroll } from '@/composables/useStickyBottomScroll'
import AgentIcon from '@/components/svgs/AgentIcon.vue'
import GlobeIcon from '@/components/svgs/GlobeIcon.vue'
import ToolIcon from '@/components/svgs/ToolIcon.vue'
import { useWorkStore } from '@/stores/work.store'
import WorkActionPrompt from './WorkActionPrompt.vue'

const props = defineProps<{ issue: string | null }>()

const workStore = useWorkStore()
const {
    actionNeedsAttention,
    actionSubmitting,
    connectionState,
    events,
    pendingAction,
    taskActive,
} = storeToRefs(workStore)

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
const visiblePendingAction = computed(() =>
    actionNeedsAttention.value ? pendingAction.value : null,
)
const scrollRevision = computed(() => [
    streamItems.value,
    visiblePendingAction.value?.id ?? null,
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

function resolveAction(decision: WorkActionDecision) {
    void workStore.resolveAction(decision).catch(() => undefined)
}

function allowBrowserActionsForTask() {
    void workStore.allowBrowserActionsForTask().catch(() => undefined)
}
</script>

<template>
    <div class="work-updates">
        <p v-if="issue" ref="issueMessage" class="work-error" role="alert" tabindex="-1">
            {{ issue }}
        </p>
        <p
            v-if="connectionState === 'reconnecting'"
            class="work-reconnect"
            data-testid="work-reconnect-status"
            role="status"
        >
            Reconnecting to Work…
        </p>

        <div
            ref="progress"
            data-testid="work-progress"
            class="work-progress"
            :class="{ 'work-progress-following': followingLatest }"
            @scroll.passive="handleScroll"
        >
            <ul
                v-if="streamItems.length"
                class="activity-list"
                aria-label="Work activity"
                aria-live="polite"
                :aria-busy="taskActive"
                role="log"
            >
                <li
                    v-for="(item, index) in streamItems"
                    :key="`${index}:${item.type}`"
                    :data-testid="`work-stream-${item.type}`"
                    class="activity-item"
                    :class="{ 'activity-item-commentary': item.type === 'commentary' }"
                >
                    <span
                        v-if="
                            taskActive &&
                            visiblePendingAction === null &&
                            index === latestActivityIndex
                        "
                        data-testid="work-progress-indicator"
                        class="activity-progress"
                        aria-hidden="true"
                    ></span>
                    <component v-else :is="streamIcons[item.icon]" class="activity-icon" />
                    <span data-testid="work-stream-copy" class="activity-copy">
                        {{ item.message }}
                    </span>
                </li>
            </ul>
        </div>
    </div>

    <WorkActionPrompt
        v-if="visiblePendingAction"
        :action="visiblePendingAction"
        :submitting="actionSubmitting"
        @always-allow="allowBrowserActionsForTask"
        @resolve="resolveAction"
    />
</template>

<style scoped lang="scss">
.work-updates {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
}

.work-error {
    margin: 0;
    color: lighten-color($color-red-600, 20%);
}

.work-reconnect {
    margin: 0;
    color: $color-ink-muted;
    font-size: 0.875rem;
}

.work-progress {
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
