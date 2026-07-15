<script setup lang="ts">
import { USER_LABELS, type JobSearchResult, type UserLabel } from '@job-search-facilitator/core'
import { shallowRef } from 'vue'

defineProps<{
    result: JobSearchResult
    labelUpdating: boolean
    labelError: string | null
}>()

const emit = defineEmits<{
    updateLabel: [label: UserLabel | null]
}>()

const selectedLabel = shallowRef<UserLabel | ''>('')

function updateLabel() {
    if (selectedLabel.value === '') {
        return
    }

    emit('updateLabel', selectedLabel.value)
    selectedLabel.value = ''
}
</script>

<template>
    <section class="post-viewer" aria-labelledby="selected-post-title">
        <div class="post-heading">
            <div class="post-labels">
                <span class="component-label">{{ result.post.company }}</span>

                <div v-if="result.post.userLabel !== null" class="user-label">
                    {{ result.post.userLabel }}
                </div>
            </div>

            <h2 id="selected-post-title" class="post-title">{{ result.post.roleTitle }}</h2>
            <p class="post-company">{{ result.post.location }}</p>
        </div>

        <p v-if="labelError" class="label-error" role="alert">{{ labelError }}</p>

        <div class="placeholder-content">
            <strong>Selected post: {{ result.post.id }}</strong>
            <p class="placeholder-copy">
                Detailed job information and review controls will appear in this panel.
            </p>
        </div>

        <div class="post-actions">
            <a
                class="open-post-button"
                :href="result.post.applicationUrl"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Open ${result.post.roleTitle} in a new tab`"
            >
                Open post ↗
            </a>

            <label class="label-picker">
                <select
                    v-model="selectedLabel"
                    class="label-picker-select"
                    :disabled="labelUpdating"
                    @change="updateLabel"
                >
                    <option disabled value="">
                        {{ result.post.userLabel === null ? 'Add label' : 'Change label' }}
                    </option>
                    <option v-for="label in USER_LABELS" :key="label" :value="label">
                        {{ label }}
                    </option>
                    <option :value="null">Clear</option>
                </select>
            </label>
        </div>
    </section>
</template>

<style scoped lang="scss">
.post-viewer {
    display: grid;
    gap: $space-5;
}

.component-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.post-heading {
    display: grid;
    gap: $space-1;
}

.post-labels {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.post-title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2rem);
    line-height: 1.15;
}

.post-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
}

.open-post-button {
    padding: $space-2 $space-3;
    color: $color-night-deep;
    font-weight: 650;
    text-decoration: none;
    background: $color-signal-light;
    border-radius: $radius-sm;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }
}

.label-picker {
    display: flex;
    gap: $space-2;
    align-items: center;
    color: $color-ink-muted;
    font-size: 0.8125rem;

    &-select {
        padding: $space-2 $space-3;
        color: $color-ink;
        font: inherit;
        background: $color-night;
        border: 1px solid rgb(245 241 251 / 16%);
        border-radius: $radius-sm;

        &:disabled {
            cursor: wait;
            opacity: 0.5;
        }
    }
}

.user-label {
    display: inline-flex;
    gap: $space-1;
    align-items: center;
    padding: $space-1 $space-3;
    color: $color-signal-light;
    font: inherit;
    font-family: $font-family-mono;
    font-size: 0.75rem;
    background: rgb(173 123 249 / 12%);
    border: 1px solid rgb(173 123 249 / 32%);
    border-radius: $radius-full;

    &:hover,
    &:focus-visible {
        --remove-label-opacity: 1;
    }

    // &:disabled {
    //     cursor: wait;
    //     opacity: 0.5;
    // }

    // &::after {
    //     content: '×';
    //     opacity: var(--remove-label-opacity, 0);
    // }
}

.label-error {
    color: lighten-color($color-red-600, 25%);
    font-size: 0.8125rem;
}

.post-company,
.placeholder-copy {
    color: $color-ink-muted;
}

.placeholder-content {
    display: grid;
    gap: $space-3;
    min-height: 12rem;
    padding: $space-4;
    background: rgb(245 241 251 / 5%);
    border: 1px dashed rgb(221 199 255 / 18%);
    border-radius: $radius-md;
}
</style>
