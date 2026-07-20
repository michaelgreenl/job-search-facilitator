<script setup lang="ts">
import { USER_LABELS, type JobPost, type UserLabel } from '@job-search-facilitator/core'
import { computed } from 'vue'
import ActionMenu, { type ActionMenuItem } from '@/components/app/ActionMenu.vue'
import PanelBackButton from '@/components/layout/PanelBackButton.vue'

import JobPostLabel from './JobPostLabel.vue'

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
        backLabel?: string | null
        backMobileOnly?: boolean
        outreachLoading?: boolean
    }>(),
    {
        showOutreachAction: false,
        outreachDisabled: false,
        showAppliedOption: false,
        applicationUpdating: false,
        applicationError: null,
        backLabel: null,
        backMobileOnly: false,
        outreachLoading: false,
    },
)

const emit = defineEmits<{
    updateLabel: [label: UserLabel | null]
    startOutreach: []
    markApplied: []
    back: []
}>()

const applied = computed(() => props.post.applicationStatus === 'awaiting-response')
const labelPrompt = computed(() => {
    if (applied.value) {
        return 'Applied'
    }

    return props.post.userLabel === null ? 'Add label' : 'Change label'
})
const postError = computed(() => props.applicationError ?? props.labelError)
const labelActions = computed<ActionMenuItem[]>(() => [
    ...USER_LABELS.map((label) => ({
        value: label,
        label,
        tone:
            label === 'P1'
                ? ('priority-high' as const)
                : label === 'P2'
                  ? ('priority-medium' as const)
                  : label === 'quick-app'
                    ? ('quick' as const)
                    : ('muted' as const),
    })),
    ...(props.showAppliedOption
        ? [{ value: 'applied', label: 'Applied', tone: 'success' as const }]
        : []),
    {
        value: 'clear',
        label: 'Clear label',
        tone: 'muted' as const,
        separatorBefore: true,
    },
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
    <section class="post-viewer" aria-labelledby="selected-post-title">
        <PanelBackButton
            v-if="backLabel"
            :label="backLabel"
            :mobile-only="backMobileOnly"
            @back="emit('back')"
        />

        <div class="post-heading">
            <div class="post-labels">
                <span class="component-label">{{ post.company }}</span>
                <JobPostLabel
                    :application-status="post.applicationStatus"
                    :user-label="post.userLabel"
                />
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
            </div>

            <ActionMenu
                class="label-picker-menu"
                button-label="Job post label"
                :label="labelPrompt"
                :items="labelActions"
                :disabled="labelUpdating || applicationUpdating || applied"
                @select="selectLabel"
            />
        </div>

        <p v-if="postError" class="label-error" role="alert">{{ postError }}</p>

        <div class="placeholder-content">
            <strong>Selected post: {{ post.id }}</strong>
            <p class="placeholder-copy">
                Detailed job information and review controls will appear in this panel.
            </p>
        </div>

        <div v-if="showOutreachAction" class="primary-actions primary-actions-outreach">
            <button
                class="post-action-button"
                type="button"
                :disabled="outreachDisabled"
                :aria-busy="outreachLoading"
                @click="emit('startOutreach')"
            >
                <span>Discover outreach</span>
                <span v-if="outreachLoading" class="outreach-spinner" aria-hidden="true"></span>
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

.outreach-spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid $color-ink-alpha-50;
    border-top-color: $color-ink;
    border-radius: 50%;
    animation: outreach-spin 0.8s linear infinite;
}

@keyframes outreach-spin {
    to {
        transform: rotate(1turn);
    }
}

.label-picker-menu {
    min-width: 9rem;
    font-size: 0.8125rem;
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
    background: $color-ink-alpha-5;
    border: 1px dashed $color-signal-light-alpha-18;
    border-radius: $radius-md;
}
</style>
