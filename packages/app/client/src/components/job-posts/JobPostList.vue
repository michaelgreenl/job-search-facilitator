<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { computed } from 'vue'

import JobPostCard from './JobPostCard.vue'

const props = withDefaults(
    defineProps<{
        posts: readonly JobPost[]
        selectedPostId: string | null
        emptyMessage: string
        loadingMessage?: string
        loading?: boolean
        error?: string | null
        pending?: boolean
    }>(),
    {
        loadingMessage: 'Loading job posts…',
        loading: false,
        error: null,
        pending: false,
    },
)
const orderedPosts = computed(() => [
    ...props.posts.filter(({ userLabel }) => userLabel !== 'forgo'),
    ...props.posts.filter(({ userLabel }) => userLabel === 'forgo'),
])

const emit = defineEmits<{
    select: [postId: string]
    selectPending: []
    retry: []
}>()
</script>

<template>
    <ul
        v-if="pending || (!loading && !error && posts.length)"
        class="card-list"
        data-testid="job-post-list"
        :class="{ 'card-list-status': pending && (loading || error) }"
    >
        <li v-if="pending">
            <JobPostCard loading @select="emit('selectPending')" />
        </li>
        <template v-if="!loading && !error">
            <li v-for="post in orderedPosts" :key="post.id">
                <JobPostCard
                    :post="post"
                    :selected="selectedPostId === post.id"
                    @select="emit('select', post.id)"
                />
            </li>
        </template>
    </ul>
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
    <p v-else-if="!pending && !posts.length" class="list-message">{{ emptyMessage }}</p>
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

    &-status {
        flex: 0 0 auto;
        padding-bottom: 0;
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
