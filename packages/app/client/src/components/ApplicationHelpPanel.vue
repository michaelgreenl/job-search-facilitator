<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import WorkStream from '@/components/WorkStream.vue'
import { useWorkStore } from '@/stores/work.store'

defineProps<{ post: JobPost }>()

const workStore = useWorkStore()
const { connectionState, error, pendingAction, task } = storeToRefs(workStore)
const outputText = (key: string) => {
    const value = task.value?.output?.[key]

    return typeof value === 'string' && value.trim() ? value.trim() : null
}
const summary = computed(() => outputText('summary'))
const currentUrl = computed(() => outputText('currentUrl'))
const applicationReady = computed(() => task.value?.output?.applicationReady)
const resultIsValid = computed(
    () =>
        typeof applicationReady.value === 'boolean' &&
        currentUrl.value !== null &&
        summary.value !== null,
)
const resultLabel = computed(() =>
    applicationReady.value === true ? 'Ready for your input' : 'Needs your attention',
)
const status = computed(() => {
    if (pendingAction.value !== null) {
        return 'Action required before Work can continue.'
    }

    if (task.value?.status === 'completed') {
        return resultIsValid.value ? 'Application page inspected.' : 'Work completed.'
    }

    if (task.value?.status === 'failed') {
        return 'Application help failed.'
    }

    switch (connectionState.value) {
        case 'connecting':
            return 'Starting application help…'
        case 'connected':
            return 'Opening the application…'
        case 'reconnecting':
            return 'Connection interrupted. Retrying…'
        default:
            return 'Preparing application help…'
    }
})
const issue = computed(() => {
    if (error.value !== null || task.value?.error) {
        return error.value ?? task.value?.error ?? null
    }

    return task.value?.status === 'completed' && !resultIsValid.value
        ? 'Work returned an invalid application result'
        : null
})
</script>

<template>
    <section class="application-help" aria-labelledby="application-help-title">
        <header class="application-help-heading">
            <span class="eyebrow">Application help</span>
            <h2 id="application-help-title" class="application-help-title">
                {{ post.company }}
            </h2>
        </header>

        <WorkStream :status="status" :issue="issue" />

        <div v-if="resultIsValid" class="application-result">
            <strong class="application-result-title">{{ resultLabel }}</strong>
            <p class="application-result-summary">{{ summary }}</p>
            <span class="application-result-url">{{ currentUrl }}</span>
        </div>
    </section>
</template>

<style scoped lang="scss">
.application-help {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
}

.application-help-heading {
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

.application-help-title,
.application-result-summary {
    margin: 0;
}

.application-help-title {
    font-size: 1.5rem;
}

.application-result {
    display: grid;
    gap: $space-2;
    padding: $space-4;
    color: $color-ink-secondary;
    background: rgb(245 241 251 / 5%);
    border: 1px solid rgb(221 199 255 / 18%);
    border-radius: $radius-md;
}

.application-result-title {
    color: $color-ink;
}

.application-result-url {
    overflow: hidden;
    color: $color-ink-muted;
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
