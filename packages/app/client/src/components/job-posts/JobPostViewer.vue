<script lang="ts">
export type JobPostViewerMode =
    | { kind: 'review' }
    | {
          kind: 'apply'
          applicationUpdating: boolean
          applicationError: string | null
          outreachDisabled: boolean
      }
</script>

<script setup lang="ts">
import {
    USER_LABELS,
    type JobPost,
    type JobRecommendation,
    type UserLabel,
} from '@job-search-facilitator/core'
import { computed } from 'vue'
import AppDropdown, { type AppDropdownOption } from '@/components/app/AppDropdown.vue'

import JobPostContent from './JobPostContent.vue'
import JobPostLabel from './JobPostLabel.vue'
import { USER_LABEL_OPTIONS } from './job-post-labels'

const props = defineProps<{
    post: JobPost
    recommendation?: JobRecommendation
    labelUpdating: boolean
    labelError: string | null
    mode: JobPostViewerMode
}>()

const emit = defineEmits<{
    updateLabel: [label: UserLabel | null]
    openOutreach: []
    markApplied: []
}>()

const applyMode = computed(() => (props.mode.kind === 'apply' ? props.mode : null))
const applied = computed(() => props.post.applicationStatus === 'awaiting-response')
const toHttpUrl = (value: string) => {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
    } catch {
        return null
    }
}
const postUrl = computed(() => toHttpUrl(props.post.postUrl))
const applicationUrl = computed(() => toHttpUrl(props.post.applicationUrl))
const applicationActionUrl = computed(() =>
    applyMode.value !== null || applicationUrl.value !== postUrl.value
        ? applicationUrl.value
        : null,
)
const labelPrompt = computed(() => {
    if (applied.value) {
        return 'Applied'
    }

    return props.post.userLabel === null ? 'Add label' : 'Change label'
})
const postError = computed(() => applyMode.value?.applicationError ?? props.labelError)
const labelOptions = computed<AppDropdownOption[]>(() => [
    ...USER_LABEL_OPTIONS,
    ...(applyMode.value !== null
        ? [{ value: 'applied', label: 'Applied', tone: 'success' as const }]
        : []),
    ...(props.post.userLabel !== null
        ? [
              {
                  value: 'clear',
                  label: 'Clear label',
                  tone: 'muted' as const,
                  separatorBefore: true,
              },
          ]
        : []),
])

const isUserLabel = (value: string): value is UserLabel =>
    USER_LABELS.some((label) => label === value)

function selectLabel(value: string) {
    if (value === 'applied') {
        emit('markApplied')
    } else if (value === 'clear') {
        emit('updateLabel', null)
    } else if (isUserLabel(value)) {
        emit('updateLabel', value)
    }
}
</script>

<template>
    <section
        class="post-viewer"
        data-testid="job-post-viewer"
        :data-post-id="post.id"
        aria-labelledby="selected-post-title"
    >
        <div class="post-heading">
            <div class="post-labels">
                <span class="component-label">{{ post.company }}</span>
                <JobPostLabel
                    :application-status="post.applicationStatus"
                    :user-label="post.userLabel"
                />
            </div>

            <h2 id="selected-post-title" class="post-title">{{ post.roleTitle }}</h2>
            <p v-if="post.location" class="post-company">{{ post.location }}</p>
        </div>

        <div class="post-actions">
            <div class="primary-actions">
                <a
                    v-if="postUrl"
                    class="post-action-button"
                    data-testid="post-link"
                    :href="postUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="`Open ${post.roleTitle} in a new tab`"
                >
                    Open post ↗
                </a>
                <a
                    v-if="applicationActionUrl"
                    class="post-action-button"
                    data-testid="application-link"
                    :href="applicationActionUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="`Open application for ${post.roleTitle} in a new tab`"
                >
                    Open application ↗
                </a>
            </div>

            <AppDropdown
                class="label-picker-dropdown"
                button-label="Job post label"
                test-id="job-label"
                :label="labelPrompt"
                :options="labelOptions"
                :disabled="labelUpdating || (applyMode?.applicationUpdating ?? false) || applied"
                @select="selectLabel"
            />
        </div>

        <p v-if="postError" class="label-error" role="alert">{{ postError }}</p>

        <JobPostContent
            :post="post"
            :recommendation="recommendation"
            :show-legitimacy="mode.kind === 'review'"
        />

        <div v-if="applyMode" class="primary-actions primary-actions-outreach">
            <button
                class="post-action-button"
                type="button"
                data-testid="discover-contacts"
                :disabled="applyMode.outreachDisabled"
                @click="emit('openOutreach')"
            >
                Discover contacts
            </button>
        </div>
    </section>
</template>

<style scoped lang="scss">
.post-viewer {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: $space-4;
    min-height: 0;
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

    &-outreach {
        justify-content: flex-end;
    }
}

.post-action-button {
    display: inline-flex;
    gap: $space-2;
    align-items: center;
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    text-decoration: none;
    background: $color-action;
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

.label-picker-dropdown {
    min-width: 9rem;
    font-size: 0.8125rem;
}

.label-error {
    color: lighten-color($color-red-600, 25%);
    font-size: 0.8125rem;
}

.post-company {
    color: $color-ink-muted;
}
</style>
