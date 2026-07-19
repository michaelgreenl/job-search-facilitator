<script setup lang="ts">
import type { WorkActionDecision } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useWorkStore } from '@/stores/work.store'

defineProps<{ company: string }>()

const workStore = useWorkStore()
const { actionSubmitting, connectionState, error, events, pendingAction, task } =
    storeToRefs(workStore)

const activities = computed(() =>
    events.value.flatMap((event) => (event.type === 'activity' ? [event.message] : [])),
)
const commentary = computed(() =>
    events.value.flatMap((event) => (event.type === 'message' ? [event.textDelta] : [])).join(''),
)
const personName = computed(() => {
    const value = task.value?.output?.personName

    return typeof value === 'string' && value.trim() ? value : null
})
const status = computed(() => {
    if (pendingAction.value !== null) {
        return 'Action required before Work can continue.'
    }

    if (task.value?.status === 'completed') {
        return personName.value === null ? 'Work completed without a contact.' : 'Contact found.'
    }

    if (task.value?.status === 'failed') {
        return 'Work task failed.'
    }

    switch (connectionState.value) {
        case 'connecting':
            return 'Starting outreach task…'
        case 'connected':
            return 'Searching LinkedIn…'
        case 'reconnecting':
            return 'Connection interrupted. Retrying…'
        default:
            return 'Preparing outreach task…'
    }
})
const issue = computed(() => error.value ?? task.value?.error ?? null)

function resolveAction(decision: WorkActionDecision) {
    void workStore.resolveAction(decision).catch(() => undefined)
}
</script>

<template>
    <section class="outreach-panel" aria-labelledby="outreach-title">
        <header class="outreach-heading">
            <span class="eyebrow">Outreach proof</span>
            <h2 id="outreach-title" class="outreach-title">{{ company }}</h2>
        </header>

        <p class="outreach-status" aria-live="polite">{{ status }}</p>
        <p v-if="issue" class="outreach-error" role="alert">{{ issue }}</p>

        <div class="outreach-progress">
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

            <p v-if="commentary" class="commentary">{{ commentary }}</p>
        </div>

        <section v-if="pendingAction" class="action-required" aria-labelledby="action-title">
            <span class="eyebrow">Action required</span>
            <h3 id="action-title" class="action-title">Website access</h3>
            <p class="action-message">{{ pendingAction.message }}</p>

            <div class="action-buttons">
                <button
                    class="action-button action-button-primary"
                    type="button"
                    :disabled="actionSubmitting"
                    @click="resolveAction('approve')"
                >
                    Allow for this task
                </button>
                <button
                    class="action-button"
                    type="button"
                    :disabled="actionSubmitting"
                    @click="resolveAction('decline')"
                >
                    Decline
                </button>
            </div>
        </section>

        <div v-if="personName" class="outreach-result">
            <span class="eyebrow">First engineering contact</span>
            <strong class="person-name">{{ personName }}</strong>
        </div>
    </section>
</template>

<style scoped lang="scss">
.outreach-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
}

.outreach-heading {
    display: grid;
    gap: $space-1;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.outreach-title,
.action-title,
.outreach-status,
.outreach-error,
.action-message,
.commentary {
    margin: 0;
}

.outreach-title {
    font-size: 1.5rem;
}

.outreach-status,
.activity-list {
    color: $color-ink-muted;
    font-size: 0.8125rem;
}

.outreach-error {
    color: lighten-color($color-red-600, 20%);
}

.action-required {
    display: grid;
    gap: $space-3;
    padding: $space-4;
    background: rgb(173 123 249 / 10%);
    border: 1px solid rgb(173 123 249 / 32%);
    border-radius: $radius-md;
}

.action-title {
    font-size: 1rem;
}

.action-message,
.commentary {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
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

.outreach-progress {
    display: grid;
    flex: 1;
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
}

.commentary {
    white-space: pre-wrap;
}

.outreach-result {
    display: grid;
    gap: $space-2;
    padding: $space-4;
    background: rgb(245 241 251 / 5%);
    border: 1px solid rgb(221 199 255 / 18%);
    border-radius: $radius-md;
}

.person-name {
    font-size: 1.25rem;
}
</style>
