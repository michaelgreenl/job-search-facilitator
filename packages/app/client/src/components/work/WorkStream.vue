<script setup lang="ts">
import type { WorkActionDecision } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useWorkStore } from '@/stores/work.store'

defineProps<{ issue: string | null }>()

const workStore = useWorkStore()
const { actionSubmitting, events, pendingAction, taskActive } = storeToRefs(workStore)

const activities = computed(() =>
    events.value.flatMap((event) =>
        event.type === 'activity'
            ? [
                  {
                      message: event.message,
                      icon:
                          event.message === 'Using Chrome' || event.message === 'Searching the web'
                              ? ('globe' as const)
                              : ('tool' as const),
                  },
              ]
            : [],
    ),
)

function resolveAction(decision: WorkActionDecision) {
    void workStore.resolveAction(decision).catch(() => undefined)
}
</script>

<template>
    <div class="work-updates">
        <p v-if="issue" class="work-error" role="alert">{{ issue }}</p>

        <div class="work-progress">
            <ul
                v-if="activities.length"
                class="activity-list"
                aria-label="Work activity"
                role="log"
            >
                <li
                    v-for="(activity, index) in activities"
                    :key="`${index}:${activity.message}`"
                    class="activity-item"
                >
                    <svg
                        class="activity-icon"
                        :class="`activity-icon-${activity.icon}`"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <template v-if="activity.icon === 'globe'">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                        </template>
                        <path
                            v-else
                            d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"
                        />
                    </svg>
                    <span>{{ activity.message }}</span>
                    <span
                        v-if="
                            taskActive && pendingAction === null && index === activities.length - 1
                        "
                        class="activity-progress"
                        aria-hidden="true"
                        >...</span
                    >
                </li>
            </ul>
        </div>
    </div>

    <section v-if="pendingAction" class="action-required" aria-labelledby="action-title">
        <span class="eyebrow">Action required</span>
        <h3 id="action-title" class="action-title">Website access</h3>
        <p class="action-message">{{ pendingAction.message }}</p>

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
    display: grid;
    flex: 1;
    gap: $space-3;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.activity-list {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: $space-2;
    margin: 0;
    padding: 0;
    color: $color-ink-muted;
    font-size: 0.8125rem;
    list-style: none;
}

.activity-item {
    display: flex;
    gap: $space-2;
    align-items: center;
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

.activity-progress {
    letter-spacing: 0.08em;
    animation: activity-blink 1.1s steps(2, end) infinite;
}

@keyframes activity-blink {
    50% {
        opacity: 0.2;
    }
}

.action-required {
    position: absolute;
    display: grid;
    gap: $space-1;
    padding: $space-4;
    background: rgb(173 123 249 / 10%);
    border: 1px solid rgb(173 123 249 / 32%);
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

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: flex-end;
    margin-top: $space-3;
}

.action-button {
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid rgb(221 199 255 / 28%);
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
