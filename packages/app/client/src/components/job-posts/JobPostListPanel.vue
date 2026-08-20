<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

import JobPostLabel from './JobPostLabel.vue'

const props = withDefaults(
    defineProps<{
        active: boolean
        adjacent: boolean
        eyebrow: string
        title: string
        titleTag?: 'h1' | 'h2'
        backLabel?: string
        backTestId?: string
        posts: readonly JobPost[]
        scrollKey?: string
        selectedPostId: string | null
        emptyMessage: string
        loadingMessage?: string
        loading?: boolean
        error?: string | null
        pending?: boolean
        showApplicationStatus?: boolean
        outreachResponsePostIds?: readonly string[]
    }>(),
    {
        titleTag: 'h2',
        backLabel: undefined,
        backTestId: undefined,
        loadingMessage: 'Loading job posts…',
        loading: false,
        error: null,
        pending: false,
        showApplicationStatus: false,
        outreachResponsePostIds: () => [],
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
    back: []
}>()
</script>

<template>
    <BasePanel
        :active="active"
        :adjacent="adjacent"
        :eyebrow="eyebrow"
        :title="title"
        :title-tag="titleTag"
        :back-label="backLabel"
        :back-test-id="backTestId"
        @back="emit('back')"
    >
        <template v-if="$slots['heading-controls']" #heading-controls>
            <slot name="heading-controls" />
        </template>

        <slot name="summary" />

        <ul
            v-if="pending || (!loading && !error && posts.length)"
            :key="scrollKey"
            class="card-list"
            data-testid="job-post-list"
            :class="{ 'card-list-status': pending && (loading || error) }"
        >
            <li v-if="pending">
                <BaseCard
                    as="button"
                    class="post-card"
                    data-testid="job-post-import-progress"
                    aria-busy="true"
                    aria-label="View job-post import progress"
                    @click="emit('selectPending')"
                >
                    <span class="component-label">Job post</span>
                    <span class="loading-post">
                        <LoadingSpinner />
                        Reviewing job post…
                    </span>
                </BaseCard>
            </li>
            <template v-if="!loading && !error">
                <li v-for="post in orderedPosts" :key="post.id">
                    <BaseCard
                        as="button"
                        class="post-card post-card-grid"
                        :data-testid="`job-post-card-${post.id}`"
                        :class="{
                            'post-card-forgone': post.userLabel === 'forgo',
                            'post-card-closed':
                                showApplicationStatus &&
                                ['rejected', 'hired'].includes(post.applicationStatus),
                        }"
                        :aria-pressed="selectedPostId === post.id"
                        :selected="selectedPostId === post.id"
                        @click="emit('select', post.id)"
                    >
                        <div class="post-card-copy">
                            <span class="component-label">{{ post.company }}</span>
                            <strong class="post-role">{{ post.roleTitle }}</strong>
                            <span class="post-company">{{ post.location }}</span>
                            <span v-if="post.postSource" class="post-meta">
                                · Source - {{ post.postSource }}
                            </span>
                            <span v-if="post.compensation" class="post-meta">
                                · Compensation - {{ post.compensation }}
                            </span>
                        </div>
                        <JobPostLabel
                            :application-status="post.applicationStatus"
                            :user-label="post.userLabel"
                            :show-application-status="showApplicationStatus"
                            :show-outreach-response="outreachResponsePostIds.includes(post.id)"
                            compact
                        />
                    </BaseCard>
                </li>
            </template>
        </ul>
        <p v-if="loading" class="list-message" role="status">{{ loadingMessage }}</p>
        <template v-else-if="error">
            <p class="list-message" role="alert">{{ error }}</p>
            <BaseButton data-testid="job-post-list-retry" preset="text" @click="emit('retry')">
                Retry
            </BaseButton>
        </template>
        <p v-else-if="!pending && !posts.length" class="list-message">{{ emptyMessage }}</p>
    </BasePanel>
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

.post-card {
    gap: $space-1;
    padding: $space-4;

    &-forgone,
    &-closed {
        filter: grayscale(1);
        opacity: 0.55;
    }
}

.post-card-grid {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: $space-4;
    align-items: start;
}

.post-card-copy {
    display: grid;
    min-width: 0;
    gap: $space-1;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.post-company {
    color: $color-ink-secondary;
}

.post-meta {
    color: $color-ink-muted;
    font-size: 0.8125rem;
}
</style>
