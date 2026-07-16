<script setup lang="ts">
import { USER_LABELS, type JobPost, type UserLabel } from '@job-search-facilitator/core'
import { shallowRef } from 'vue'

defineProps<{
    post: JobPost
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
                <span class="component-label">{{ post.company }}</span>

                <div
                    v-if="post.userLabel !== null"
                    class="user-label"
                    :class="{ 'user-label-forgo': post.userLabel === 'forgo' }"
                >
                    <template v-if="post.userLabel === 'forgo'"> forgone </template>
                    <template v-else>
                        {{ post.userLabel }}
                    </template>
                </div>
            </div>

            <h2 id="selected-post-title" class="post-title">{{ post.roleTitle }}</h2>
            <p class="post-company">{{ post.location }}</p>
        </div>

        <div class="post-actions">
            <a
                class="open-post-button"
                :href="post.applicationUrl"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Open ${post.roleTitle} in a new tab`"
            >
                Open post ↗
            </a>

            <label class="label-picker">
                <span class="select-field">
                    <select
                        v-model="selectedLabel"
                        class="select-control label-picker-select"
                        aria-label="Job post label"
                        :disabled="labelUpdating"
                        @change="updateLabel"
                    >
                        <option disabled value="">
                            {{ post.userLabel === null ? 'Add label' : 'Change label' }}
                        </option>
                        <option v-for="label in USER_LABELS" :key="label" :value="label">
                            {{ label }}
                        </option>
                        <option :value="null">clear label</option>
                    </select>
                </span>
            </label>
        </div>

        <p v-if="labelError" class="label-error" role="alert">{{ labelError }}</p>

        <div class="placeholder-content">
            <strong>Selected post: {{ post.id }}</strong>
            <p class="placeholder-copy">
                Detailed job information and review controls will appear in this panel.
            </p>
        </div>
    </section>
</template>

<style scoped lang="scss">
.post-viewer {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: $space-4;
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
    color: $color-ink;
    font-weight: 650;
    text-decoration: none;
    background: #af8de2;
    border-radius: $radius-md;

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
        min-width: 8rem;
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

    &-forgo {
        filter: grayscale(1);
        opacity: 0.55;
    }
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
    flex: 1;
    display: grid;
    gap: $space-3;
    min-height: 12rem;
    padding: $space-4;
    background: rgb(245 241 251 / 5%);
    border: 1px dashed rgb(221 199 255 / 18%);
    border-radius: $radius-md;
}
</style>
