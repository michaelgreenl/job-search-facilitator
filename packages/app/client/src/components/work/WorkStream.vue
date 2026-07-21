<script setup lang="ts">
import type { WorkActionDecision } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef, watch, type Component } from 'vue'
import { useStickyBottomScroll } from '@/composables/useStickyBottomScroll'
import AgentIcon from '@/components/svgs/AgentIcon.vue'
import GlobeIcon from '@/components/svgs/GlobeIcon.vue'
import ToolIcon from '@/components/svgs/ToolIcon.vue'
import { useWorkStore } from '@/stores/work.store'

const props = defineProps<{ issue: string | null }>()

const workStore = useWorkStore()
const {
    actionNeedsAttention,
    actionSubmitting,
    alwaysAllowBrowserActions,
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

function resolveAction(decision: WorkActionDecision) {
    void workStore.resolveAction(decision).catch(() => undefined)
}

function allowBrowserActionsForTask() {
    void workStore.allowBrowserActionsForTask().catch(() => undefined)
}
</script>

<template>
    <div class="work-updates">
        <p v-if="issue" class="work-error" role="alert">{{ issue }}</p>

        <div
            ref="progress"
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
                    class="activity-item"
                    :class="`activity-item-${item.type}`"
                >
                    <span
                        v-if="
                            taskActive &&
                            visiblePendingAction === null &&
                            index === latestActivityIndex
                        "
                        class="activity-progress"
                        aria-hidden="true"
                    ></span>
                    <component
                        v-else
                        :is="streamIcons[item.icon]"
                        class="activity-icon"
                        :class="`activity-icon-${item.icon}`"
                    />
                    <span class="activity-copy">{{ item.message }}</span>
                </li>
            </ul>
        </div>
    </div>

    <section v-if="visiblePendingAction" class="action-required" aria-labelledby="action-title">
        <span class="eyebrow">Action required</span>
        <h3 id="action-title" class="action-title">Website access</h3>
        <p class="action-message">{{ visiblePendingAction.message }}</p>

        <div class="action-controls">
            <label class="always-allow">
                <input
                    class="always-allow-checkbox"
                    type="checkbox"
                    :checked="alwaysAllowBrowserActions"
                    :disabled="actionSubmitting"
                    @change="allowBrowserActionsForTask"
                />
                <span>Always allow for this task</span>
            </label>

            <div class="action-buttons">
                <button
                    class="action-button"
                    type="button"
                    :disabled="actionSubmitting"
                    @click="resolveAction('decline')"
                >
                    Decline
                </button>
                <button
                    class="action-button action-button-primary"
                    type="button"
                    :disabled="actionSubmitting"
                    @click="resolveAction('approve')"
                >
                    Allow for this task
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped lang="scss">
.work-updates {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
}

.work-error,
.action-title,
.action-message {
    margin: 0;
}

.work-error {
    color: lighten-color($color-red-600, 20%);
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

.action-required {
    display: grid;
    gap: $space-1;
    padding: $space-4;
    background: $color-signal-alpha-10;
    border: 1px solid $color-signal-alpha-32;
    border-radius: $radius-md;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.action-title {
    font-size: 1rem;
}

.action-message {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.action-controls {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
    margin-top: $space-3;
}

.always-allow {
    display: inline-flex;
    gap: $space-2;
    align-items: center;
    color: $color-ink-secondary;
    font-size: 0.8125rem;
    cursor: pointer;
}

.always-allow-checkbox {
    width: 1rem;
    height: 1rem;
    margin: 0;
    cursor: pointer;
    accent-color: $color-signal-light;

    &:disabled {
        cursor: wait;
    }
}

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
    margin-left: auto;
}

.action-button {
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid $color-signal-light-alpha-28;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        border-color: $color-signal-light;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }

    &-primary {
        color: $color-night;
        font-weight: 650;
        background: $color-signal-light;
        border-color: transparent;
    }
}
</style>
