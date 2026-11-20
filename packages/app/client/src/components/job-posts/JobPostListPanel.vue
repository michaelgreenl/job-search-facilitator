<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import type { JobPostImportItem } from '@/stores/job-post-import'

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
        pendingImports?: readonly JobPostImportItem[]
        showApplicationStatus?: boolean
        outreachResponsePostIds?: readonly string[]
        addable?: boolean
    }>(),
    {
        titleTag: 'h2',
        backLabel: undefined,
        backTestId: undefined,
        loadingMessage: 'Loading job posts…',
        loading: false,
        error: null,
        pendingImports: () => [],
        showApplicationStatus: false,
        outreachResponsePostIds: () => [],
        addable: false,
    },
)
const orderedPosts = computed(() => [
    ...props.posts.filter(({ userLabel }) => userLabel !== 'forgo'),
    ...props.posts.filter(({ userLabel }) => userLabel === 'forgo'),
])
// Card text inside a button is not announced, so this region tells screen readers when an
// import waits on the user. The counts change the text, so each new wait is announced again.
const importStatus = computed(() => {
    const permission = props.pendingImports.filter((item) => item.permissionRequired).length
    const attention = props.pendingImports.filter((item) => !item.active).length
    const messages: string[] = []

    if (permission > 0) {
        messages.push(`Imports that need permission: ${permission}.`)
    }

    if (attention > 0) {
        messages.push(`Imports that need attention: ${attention}.`)
    }

    return messages.join(' ')
})

const emit = defineEmits<{
    select: [postId: string]
    selectImport: [taskId: string]
    retry: []
    back: []
    addPost: []
}>()
</script>

<template>
    <BasePanel
        class="job-post-list-panel"
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
            v-if="pendingImports.length > 0 || (!loading && !error && posts.length)"
            :key="scrollKey"
            class="card-list"
            data-testid="job-post-list"
            :class="{
                'card-list-addable': addable,
                'card-list-status': pendingImports.length > 0 && (loading || error),
            }"
        >
            <li v-for="item in pendingImports" :key="item.taskId">
                <BaseCard
                    as="button"
                    class="post-card"
                    :data-testid="`job-post-import-${item.taskId}`"
                    :aria-busy="item.active || undefined"
                    @click="emit('selectImport', item.taskId)"
                >
                    <span class="component-label">Job post</span>
                    <span class="loading-post">
                        <template v-if="item.active">
                            <LoadingSpinner />
                            Reviewing job post…
                        </template>
                        <template v-else>Import needs attention</template>
                    </span>
                    <span
                        v-if="item.permissionRequired"
                        class="permission-notice"
                        :data-testid="`job-post-import-${item.taskId}-permission-needed`"
                    >
                        Permission needed — open import to continue
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
        <p class="import-status" role="status">{{ importStatus }}</p>
        <p v-if="loading" class="list-message" role="status">{{ loadingMessage }}</p>
        <template v-else-if="error">
            <p class="list-message" role="alert">{{ error }}</p>
            <BaseButton data-testid="job-post-list-retry" preset="text" @click="emit('retry')">
                Retry
            </BaseButton>
        </template>
        <p v-else-if="!pendingImports.length && !posts.length" class="list-message">
            {{ emptyMessage }}
        </p>

        <BaseButton
            v-if="addable"
            class="add-button"
            icon-size="md"
            preset="primary"
            tooltip="Add job post"
            data-testid="job-post-list-add"
            aria-label="Add job post"
            @click="emit('addPost')"
        >
            <span class="add-button-icon" aria-hidden="true">+</span>
        </BaseButton>
    </BasePanel>
</template>

<style scoped lang="scss">
// Lets the last card scroll clear of the add button: its inset, its height, and a card gap.
$add-button-clearance: $space-5 + 2.25rem + $space-3;

.job-post-list-panel {
    position: relative;
}

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

    &-addable {
        padding-bottom: $add-button-clearance;
        scroll-padding-bottom: $add-button-clearance;
    }

    &-status {
        flex: 0 0 auto;
        padding-bottom: 0;
    }
}

.list-message {
    color: $color-ink-muted;
}

.add-button {
    position: absolute;
    right: $space-5;
    bottom: $space-5;
}

.add-button-icon {
    font-size: 1.25rem;
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

.import-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.permission-notice {
    width: fit-content;
    padding: $space-1 $space-2;
    margin-top: $space-1;
    color: $color-amber-500;
    font-size: 0.75rem;
    font-weight: 650;
    background: $color-amber-500-alpha-12;
    border-radius: $radius-full;
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
