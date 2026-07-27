<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'

import JobPostCard from './JobPostCard.vue'

withDefaults(
    defineProps<{
        posts: readonly JobPost[]
        selectedPostId: string | null
        emptyMessage: string
        loadingMessage?: string
        loading?: boolean
        error?: string | null
    }>(),
    {
        loadingMessage: 'Loading job posts…',
        loading: false,
        error: null,
    },
)

const emit = defineEmits<{
    select: [postId: string]
    retry: []
}>()
</script>

<template>
    <p v-if="loading" class="list-message" role="status">{{ loadingMessage }}</p>
    <template v-else-if="error">
        <p class="list-message" role="alert">{{ error }}</p>
        <button
            class="retry-button"
            data-testid="job-post-list-retry"
            type="button"
            @click="emit('retry')"
        >
            Retry
        </button>
    </template>
    <ul v-else-if="posts.length" class="card-list">
        <li v-for="post in posts" :key="post.id">
            <JobPostCard
                :post="post"
                :selected="selectedPostId === post.id"
                @select="emit('select', post.id)"
            />
        </li>
    </ul>
    <p v-else class="list-message">{{ emptyMessage }}</p>
</template>

<style scoped lang="scss">
.card-list {
    display: flex;
    flex: 1 0 0;
    flex-direction: column;
    gap: $space-3;
    margin: 0;
    padding: 0 0 $space-5;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;

    li {
        min-width: 0;
    }
}

.list-message {
    color: $color-ink-muted;
}

.retry-button {
    width: fit-content;
    padding: 0;
    color: $color-signal-light;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }
}
</style>
