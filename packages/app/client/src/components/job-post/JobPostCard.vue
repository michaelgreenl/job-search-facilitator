<script setup lang="ts">
import type { JobSearchResult } from '@job-search-facilitator/core'

defineProps<{
    result: JobSearchResult
    selected: boolean
}>()

const emit = defineEmits<{
    select: []
}>()
</script>

<template>
    <button
        class="post-card"
        :class="{ 'post-card-selected': selected }"
        type="button"
        :aria-pressed="selected"
        @click="emit('select')"
    >
        <span class="component-label">Job post card · Rank {{ result.agentRank }}</span>
        <strong class="post-role">{{ result.post.roleTitle }}</strong>
        <span class="post-company">{{ result.post.company }}</span>
        <span class="post-meta">
            {{ result.post.location ?? 'Location not listed' }} · {{ result.post.postSource }}
        </span>
    </button>
</template>

<style scoped lang="scss">
.post-card {
    display: grid;
    gap: $space-1;
    width: 100%;
    padding: $space-4;
    color: $color-ink;
    font: inherit;
    text-align: start;
    cursor: pointer;
    background: rgb(245 241 251 / 5%);
    border: 1px solid rgb(245 241 251 / 9%);
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: rgb(173 123 249 / 9%);
        border-color: rgb(173 123 249 / 28%);
    }

    &-selected {
        background: rgb(173 123 249 / 12%);
        border-color: $color-signal !important;
    }
}

.component-label {
    margin-block-end: $space-1;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.post-role {
    text-wrap: balance;
}

.post-company {
    color: $color-ink-secondary;
}

.post-meta {
    color: $color-ink-muted;
    font-size: 0.8125rem;
}
</style>
