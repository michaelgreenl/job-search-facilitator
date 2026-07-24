<script setup lang="ts">
import type { JobPost, JobRecommendation, ResumeType } from '@job-search-facilitator/core'
import { computed } from 'vue'

const props = withDefaults(
    defineProps<{
        post: JobPost
        recommendation?: JobRecommendation
        showLegitimacy?: boolean
    }>(),
    {
        recommendation: undefined,
        showLegitimacy: true,
    },
)

const RESUME_LABELS: Record<ResumeType, string> = {
    frontend: 'Frontend',
    'backend-full-stack': 'Backend / full-stack',
    general: 'General',
}

const normalizeText = (value: string | null | undefined) => {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

const content = computed(() => {
    const techStack = normalizeText(props.post.techStack)

    return {
        compensation: normalizeText(props.post.compensation),
        fitRationale: normalizeText(props.recommendation?.fitRationale),
        keyLegitimacySignals: normalizeText(
            props.showLegitimacy ? props.recommendation?.keyLegitimacySignals : null,
        ),
        legitimacyNotes: normalizeText(
            props.showLegitimacy ? props.recommendation?.legitimacyNotes : null,
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
</script>

<template>
    <div v-if="hasContent" class="post-content">
        <section v-if="hasFacts" class="content-section">
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
            <section v-if="hasRecommendation" class="content-section">
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

            <section v-if="hasLegitimacy" class="content-section">
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
</template>

<style scoped lang="scss">
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
