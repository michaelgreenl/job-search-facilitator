<script setup lang="ts">
import type { JobPost } from '@job-search-facilitator/core'
import { computed } from 'vue'

const props = defineProps<{
    post: JobPost
    selected: boolean
}>()

const emit = defineEmits<{
    select: []
}>()

const applied = computed(() => props.post.applicationStatus === 'awaiting-response')
</script>

<template>
    <button
        class="post-card"
        :class="{
            'post-card-selected': selected,
            'post-card-forgone': post.userLabel === 'forgo',
        }"
        type="button"
        :aria-pressed="selected"
        @click="emit('select')"
    >
        <div class="post-card-header">
            <span class="component-label">{{ post.company }}</span>
            <span
                v-if="applied || post.userLabel !== null"
                class="user-label"
                :class="{ 'user-label-applied': applied }"
            >
                <template v-if="applied"> applied </template>
                <template v-else-if="post.userLabel === 'forgo'"> forgone </template>
                <template v-else>
                    {{ post.userLabel }}
                </template>
            </span>
        </div>
        <strong class="post-role">{{ post.roleTitle }}</strong>
        <span class="post-company">{{ post.location }}</span>
        <span class="post-meta" v-if="post.postSource"> · Source - {{ post.postSource }} </span>
        <span class="post-meta" v-if="post.compensation">
            · Compensation - {{ post.compensation }}
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

    &-applied {
        color: $color-ink;
        background: rgb(43 138 62 / 25%);
        border-color: rgb(43 138 62 / 55%);
    }
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
