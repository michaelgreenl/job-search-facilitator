<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

const props = defineProps<{
    count: number
    selected: boolean
    loading: boolean
    error: string | null
}>()

const emit = defineEmits<{
    add: []
    select: []
    retry: []
}>()

const countLabel = computed(() => `${props.count} ${props.count === 1 ? 'post' : 'posts'}`)
</script>

<template>
    <article class="user-source">
        <div class="user-source-card" :class="{ 'is-selected': selected }">
            <button
                class="user-source-select"
                data-testid="user-added-source"
                type="button"
                :aria-pressed="selected"
                @click="emit('select')"
            >
                <strong class="source-title">Added by you</strong>
                <span v-if="loading" class="source-count" role="status">Loading…</span>
                <span v-else class="source-count">{{ countLabel }}</span>
            </button>

            <BaseButton
                class="add-button-tooltip"
                icon-size="md"
                preset="primary"
                tooltip="Add job post"
                data-testid="add-job-post"
                aria-label="Add job post"
                @click="emit('add')"
            >
                <span class="add-button-icon" aria-hidden="true">+</span>
            </BaseButton>
        </div>

        <div v-if="error" class="source-error">
            <p class="source-error-message" role="alert">{{ error }}</p>
            <BaseButton data-testid="review-user-added-retry" preset="text" @click="emit('retry')">
                Retry
            </BaseButton>
        </div>
    </article>
</template>

<style scoped lang="scss">
.user-source {
    display: grid;
    gap: $space-2;
}

.user-source-card {
    display: flex;
    align-items: center;
    width: 100%;
    color: $color-ink;
    background: $color-ink-alpha-5;
    border: 1px solid $color-ink-alpha-9;
    border-radius: $radius-md;

    &:hover,
    &:focus-within {
        background: $color-signal-alpha-9;
        border-color: $color-signal-alpha-28;
    }

    &.is-selected {
        background: $color-signal-alpha-12;
        border-color: $color-signal !important;
    }
}

.user-source-select {
    display: grid;
    flex: 1 1 auto;
    gap: $space-1;
    align-self: stretch;
    justify-items: start;
    min-width: 0;
    padding: $space-4;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    background: transparent;
    border: 0;
}

.source-title {
    text-wrap: balance;
}

.source-count,
.source-error-message {
    margin: 0;
    color: $color-ink-muted;
    font-size: 0.8125rem;
}

.source-count {
    white-space: nowrap;
}

.add-button-icon {
    font-size: 1.25rem;
}

.add-button-tooltip {
    flex: 0 0 auto;
    margin-inline: auto $space-4;
}

.source-error {
    display: flex;
    gap: $space-2;
    align-items: baseline;
}
</style>
