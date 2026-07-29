<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import BaseButton from '@/components/base/BaseButton.vue'

import JobPostLabel from './JobPostLabel.vue'

withDefaults(
    defineProps<{
        loading?: boolean
        post?: JobPost
        selected?: boolean
    }>(),
    {
        loading: false,
        post: undefined,
        selected: false,
    },
)

const emit = defineEmits<{
    select: []
}>()
</script>

<template>
    <BaseButton
        v-if="loading || post"
        class="post-card"
        preset="card"
        :data-testid="loading ? 'job-post-import-progress' : `job-post-card-${post!.id}`"
        :class="{
            'post-card-selected': selected,
            'post-card-forgone': post?.userLabel === 'forgo',
        }"
        :aria-busy="loading || undefined"
        :aria-label="loading ? 'View job-post import progress' : undefined"
        :aria-pressed="loading ? undefined : selected"
        @click="emit('select')"
    >
        <template v-if="loading">
            <span class="component-label">Job post</span>
            <span class="loading-post">
                <LoadingSpinner />
                Reviewing job post…
            </span>
        </template>
        <template v-else-if="post">
            <div class="post-card-header">
                <span class="component-label">{{ post.company }}</span>
                <JobPostLabel
                    :application-status="post.applicationStatus"
                    :user-label="post.userLabel"
                    compact
                />
            </div>
            <strong class="post-role">{{ post.roleTitle }}</strong>
            <span class="post-company">{{ post.location }}</span>
            <span v-if="post.postSource" class="post-meta"> · Source - {{ post.postSource }} </span>
            <span v-if="post.compensation" class="post-meta">
                · Compensation - {{ post.compensation }}
            </span>
        </template>
    </BaseButton>
</template>

<style scoped lang="scss">
.post-card {
    gap: $space-1;
    padding: $space-4;

    &-selected {
        background: $color-signal-alpha-12;
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

.loading-post {
    display: flex;
    gap: $space-2;
    align-items: center;
    min-height: 2rem;
    color: $color-ink-secondary;
}

.post-role {
    text-wrap: balance;
}

.post-company,
.post-meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.post-company {
    color: $color-ink-secondary;
}

.post-meta {
    color: $color-ink-muted;
    font-size: 0.8125rem;
}
</style>
