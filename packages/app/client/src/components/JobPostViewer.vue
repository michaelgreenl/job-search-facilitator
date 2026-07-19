<script setup lang="ts">
import { USER_LABELS, type JobPost, type UserLabel } from '@job-search-facilitator/core'
import { computed, shallowRef } from 'vue'

const props = withDefaults(
    defineProps<{
        post: JobPost
        labelUpdating: boolean
        labelError: string | null
        showOutreachAction?: boolean
        outreachDisabled?: boolean
        showAppliedOption?: boolean
        applicationUpdating?: boolean
        applicationError?: string | null
    }>(),
    {
        showOutreachAction: false,
        outreachDisabled: false,
        showAppliedOption: false,
        applicationUpdating: false,
        applicationError: null,
    },
)

const emit = defineEmits<{
    updateLabel: [label: UserLabel | null]
    startOutreach: []
    markApplied: []
}>()

type LabelSelection = UserLabel | 'applied' | null | ''

const selectedLabel = shallowRef<LabelSelection>('')
const applied = computed(() => props.post.applicationStatus === 'awaiting-response')
const labelPrompt = computed(() => {
    if (applied.value) {
        return 'Applied'
    }

    return props.post.userLabel === null ? 'Add label' : 'Change label'
})
const postError = computed(() => props.applicationError ?? props.labelError)

function updateLabel() {
    if (selectedLabel.value === '') {
        return
    }

    if (selectedLabel.value === 'applied') {
        emit('markApplied')
    } else {
        emit('updateLabel', selectedLabel.value)
    }

    selectedLabel.value = ''
}
</script>

<template>
    <section class="post-viewer" aria-labelledby="selected-post-title">
        <div class="post-heading">
            <div class="post-labels">
                <span class="component-label">{{ post.company }}</span>

                <div
                    v-if="applied || post.userLabel !== null"
                    class="user-label"
                    :class="{
                        'user-label-applied': applied,
                        'user-label-forgo': !applied && post.userLabel === 'forgo',
                    }"
                >
                    <template v-if="applied"> applied </template>
                    <template v-else-if="post.userLabel === 'forgo'"> forgone </template>
                    <template v-else>
                        {{ post.userLabel }}
                    </template>
                </div>
            </div>

            <h2 id="selected-post-title" class="post-title">{{ post.roleTitle }}</h2>
            <p class="post-company">{{ post.location }}</p>
        </div>

        <div class="post-actions">
            <div class="primary-actions">
                <a
                    class="post-action-button"
                    :href="post.applicationUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="`Open ${post.roleTitle} in a new tab`"
                >
                    Open post ↗
                </a>

                <button
                    v-if="showOutreachAction"
                    class="post-action-button"
                    type="button"
                    :disabled="outreachDisabled"
                    @click="emit('startOutreach')"
                >
                    Find outreach contact
                </button>
            </div>

            <label class="label-picker">
                <span class="select-field">
                    <select
                        v-model="selectedLabel"
                        class="select-control label-picker-select"
                        aria-label="Job post label"
                        :disabled="labelUpdating || applicationUpdating || applied"
                        @change="updateLabel"
                    >
                        <option disabled value="">{{ labelPrompt }}</option>
                        <option v-for="label in USER_LABELS" :key="label" :value="label">
                            {{ label }}
                        </option>
                        <option v-if="showAppliedOption" value="applied">Applied</option>
                        <option :value="null">clear label</option>
                    </select>
                </span>
            </label>
        </div>

        <p v-if="postError" class="label-error" role="alert">{{ postError }}</p>

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

.primary-actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
}

.post-action-button {
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    text-decoration: none;
    background: #af8de2;
    border: 0;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
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

    &-applied {
        color: $color-ink;
        background: rgb(43 138 62 / 25%);
        border-color: rgb(43 138 62 / 55%);
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
