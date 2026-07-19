<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'

import JobPostCard from './JobPostCard.vue'

withDefaults(
    defineProps<{
        posts: JobPost[]
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
}>()
</script>

<template>
    <p v-if="loading" class="list-message">{{ loadingMessage }}</p>
    <p v-else-if="error" class="list-message">{{ error }}</p>
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
</style>
