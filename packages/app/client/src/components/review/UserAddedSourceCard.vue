<script setup lang="ts">
import { computed } from 'vue'
import ButtonTooltip from '@/components/app/ButtonTooltip.vue'

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

            <ButtonTooltip v-slot="{ tooltipId }" class="add-button-tooltip" label="Add job post">
                <button
                    class="add-button"
                    data-testid="add-job-post"
                    type="button"
                    aria-label="Add job post"
                    :aria-describedby="tooltipId"
                    @click="emit('add')"
                >
                    <span aria-hidden="true">+</span>
                </button>
            </ButtonTooltip>
        </div>

        <div v-if="error" class="source-error">
            <p class="source-error-message" role="alert">{{ error }}</p>
            <button
                class="retry-button"
                data-testid="review-user-added-retry"
                type="button"
                @click="emit('retry')"
            >
                Retry
            </button>
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

.add-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    color: $color-ink;
    font: inherit;
    font-size: 1.25rem;
    font-weight: 650;
    line-height: 1;
    cursor: pointer;
    background: $color-action;
    border: 0;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }
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

.retry-button {
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
