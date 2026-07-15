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
        :class="{
            'post-card-selected': selected,
            'post-card-forgone': result.post.userLabel === 'forgo',
        }"
        type="button"
        :aria-pressed="selected"
        @click="emit('select')"
    >
        <div class="post-card-header">
            <span class="component-label">{{ result.post.company }}</span>
            <span v-if="result.post.userLabel !== null" class="user-label">
                {{ result.post.userLabel }}
            </span>
        </div>
        <strong class="post-role">{{ result.post.roleTitle }}</strong>
        <span class="post-company">{{ result.post.location }}</span>
        <span class="post-meta">
            {{ result.post.postSource ?? 'Location not listed' }} · {{ result.post.compensation }}
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

    &-forgone {
        filter: grayscale(1);
        opacity: 0.55;
    }
}

.post-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.component-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.post-role {
    text-wrap: balance;
}

.user-label {
    width: fit-content;
    padding: $space-1 $space-2;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    background: rgb(173 123 249 / 12%);
    border: 1px solid rgb(173 123 249 / 24%);
    border-radius: $radius-full;
}

.post-company {
    color: $color-ink-secondary;
}

.post-meta {
    color: $color-ink-muted;
    font-size: 0.8125rem;
}
</style>
