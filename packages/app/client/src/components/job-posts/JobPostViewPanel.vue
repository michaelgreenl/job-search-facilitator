<script lang="ts">
export type JobPostViewPanelMode =
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
    type ResumeType,
    type StandaloneJobRecommendation,
    type UserLabel,
} from '@job-search-facilitator/core'
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import BasePanel from '@/components/base/BasePanel.vue'

import JobPostLabel from './JobPostLabel.vue'
import { USER_LABEL_OPTIONS } from './job-post-labels'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    backLabel?: string
    backMobileOnly?: boolean
    post: JobPost
    recommendation?: StandaloneJobRecommendation
    labelUpdating: boolean
    labelError: string | null
    mode: JobPostViewPanelMode
}>()

const emit = defineEmits<{
    updateLabel: [label: UserLabel | null]
    openOutreach: []
    markApplied: []
    back: []
}>()

const RESUME_LABELS: Record<ResumeType, string> = {
    frontend: 'Frontend',
    'backend-full-stack': 'Backend / full-stack',
    general: 'General',
}

const normalizeText = (value: string | null | undefined) => {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

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
const labelOptions = computed<BaseDropdownOption[]>(() => [
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
const content = computed(() => {
    const techStack = normalizeText(props.post.techStack)

    return {
        compensation: normalizeText(props.post.compensation),
        fitRationale: normalizeText(props.recommendation?.fitRationale),
        keyLegitimacySignals: normalizeText(
            props.mode.kind === 'review' ? props.recommendation?.keyLegitimacySignals : null,
        ),
        legitimacyNotes: normalizeText(
            props.mode.kind === 'review' ? props.recommendation?.legitimacyNotes : null,
        ),
        postSource: normalizeText(props.post.postSource),
        recommendedAction: normalizeText(props.recommendation?.recommendedAction),
        recommendedResume: props.recommendation
            ? RESUME_LABELS[props.recommendation.recommendedResume]
            : null,
        techStack: techStack?.toLowerCase() === 'not recorded' ? null : techStack,
    }
})
const hasFacts = computed(
    () =>
        content.value.recommendedResume !== null ||
        content.value.compensation !== null ||
        content.value.postSource !== null ||
        content.value.techStack !== null,
)
const hasRecommendation = computed(
    () => content.value.recommendedAction !== null || content.value.fitRationale !== null,
)
const hasLegitimacy = computed(
    () => content.value.keyLegitimacySignals !== null || content.value.legitimacyNotes !== null,
)
const hasAnalysis = computed(() => hasRecommendation.value || hasLegitimacy.value)
const hasContent = computed(() => hasFacts.value || hasAnalysis.value)

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
    <BasePanel
        as="aside"
        :active="active"
        :adjacent="adjacent"
        :back-label="backLabel"
        back-test-id="back-to-job-posts"
        :back-mobile-only="backMobileOnly"
        @back="emit('back')"
    >
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
                    <BaseButton
                        v-if="postUrl"
                        as="a"
                        data-testid="post-link"
                        :href="postUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="`Open ${post.roleTitle} in a new tab`"
                    >
                        Open post ↗
                    </BaseButton>
                    <BaseButton
                        v-if="applicationActionUrl"
                        as="a"
                        data-testid="application-link"
                        :href="applicationActionUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="`Open application for ${post.roleTitle} in a new tab`"
                    >
                        Open application ↗
                    </BaseButton>
                </div>

                <BaseDropdown
                    class="label-picker-dropdown"
                    accessible-label="Job post label"
                    test-id="job-label"
                    :label="labelPrompt"
                    :options="labelOptions"
                    :disabled="
                        labelUpdating || (applyMode?.applicationUpdating ?? false) || applied
                    "
                    @select="selectLabel"
                />
            </div>

            <p v-if="postError" class="label-error" data-testid="job-post-error" role="alert">
                {{ postError }}
            </p>

            <div v-if="hasContent" class="post-content">
                <section v-if="hasFacts" class="content-section" data-testid="post-facts">
                    <h3 class="content-section-title">At a glance</h3>

                    <dl class="post-facts">
                        <div v-if="content.recommendedResume" class="post-fact">
                            <dt>Recommended resume</dt>
                            <dd>{{ content.recommendedResume }}</dd>
                        </div>
                        <div v-if="content.compensation" class="post-fact">
                            <dt>Compensation</dt>
                            <dd>{{ content.compensation }}</dd>
                        </div>
                        <div v-if="content.postSource" class="post-fact">
                            <dt>Source</dt>
                            <dd>{{ content.postSource }}</dd>
                        </div>
                        <div v-if="content.techStack" class="post-fact post-fact-stack">
                            <dt>Tech stack</dt>
                            <dd>{{ content.techStack }}</dd>
                        </div>
                    </dl>
                </section>

                <div v-if="hasAnalysis" class="post-analysis">
                    <section
                        v-if="hasRecommendation"
                        class="content-section"
                        data-testid="post-recommendation"
                    >
                        <h3 class="content-section-title">Recommendation</h3>

                        <div v-if="content.recommendedAction" class="content-block">
                            <h4 class="content-block-title">Recommended action</h4>
                            <p class="content-copy recommended-action">
                                {{ content.recommendedAction }}
                            </p>
                        </div>

                        <div v-if="content.fitRationale" class="content-block">
                            <h4 class="content-block-title">Why it fits</h4>
                            <p class="content-copy">{{ content.fitRationale }}</p>
                        </div>
                    </section>

                    <section
                        v-if="hasLegitimacy"
                        class="content-section"
                        data-testid="post-legitimacy"
                    >
                        <h3 class="content-section-title">Legitimacy</h3>

                        <div v-if="content.keyLegitimacySignals" class="content-block">
                            <h4 class="content-block-title">Key signals</h4>
                            <p class="content-copy">{{ content.keyLegitimacySignals }}</p>
                        </div>

                        <div v-if="content.legitimacyNotes" class="content-block">
                            <h4 class="content-block-title">Notes</h4>
                            <p class="content-copy">{{ content.legitimacyNotes }}</p>
                        </div>
                    </section>
                </div>
            </div>

            <div v-if="applyMode" class="primary-actions primary-actions-outreach">
                <BaseButton
                    data-testid="discover-contacts"
                    :disabled="applyMode.outreachDisabled"
                    @click="emit('openOutreach')"
                >
                    Outreach
                </BaseButton>
            </div>
        </section>
    </BasePanel>
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

.post-content {
    container-name: post-content;
    container-type: inline-size;
    flex: 1;
    display: grid;
    align-content: start;
    gap: $space-4;
    min-height: 0;
    padding-right: $space-1;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.content-section {
    display: grid;
    align-content: start;
    gap: $space-3;
    min-width: 0;
    padding: $space-4;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.content-section-title {
    margin: 0;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.post-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: $space-3 $space-4;
    margin: 0;
}

.post-fact {
    display: grid;
    align-content: start;
    gap: $space-1;
    min-width: 0;

    &-stack {
        grid-column: 1 / -1;
    }
}

.post-fact dt,
.content-block-title {
    margin: 0;
    color: $color-ink-muted;
    font-size: 0.75rem;
    font-weight: 600;
}

.post-fact dd {
    margin: 0;
    color: $color-ink;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
}

.post-analysis {
    display: grid;
    align-items: start;
    gap: $space-4;
}

.content-block {
    display: grid;
    gap: $space-1;
    min-width: 0;
}

.content-copy {
    margin: 0;
    color: $color-ink-secondary;
    font-size: 0.9375rem;
    line-height: 1.55;
    white-space: pre-line;
    overflow-wrap: anywhere;
}

.recommended-action {
    color: $color-ink;
    font-weight: 600;
}

@container post-content (min-width: 40rem) {
    .post-analysis {
        grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
    }
}
</style>
