<script setup lang="ts">
import type { WorkActionDecision } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useWorkStore } from '@/stores/work.store'

defineProps<{ issue: string | null }>()

const workStore = useWorkStore()
const { actionSubmitting, events, pendingAction } = storeToRefs(workStore)

const activities = computed(() =>
    events.value.flatMap((event) => (event.type === 'activity' ? [event.message] : [])),
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
                <li v-for="(activity, index) in activities" :key="`${index}:${activity}`">
                    {{ activity }}
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
    gap: $space-3;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.activity-list {
    display: grid;
    gap: $space-1;
    margin: 0;
    padding-left: $space-5;
    color: $color-ink-muted;
    font-size: 0.8125rem;
}

.action-required {
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
