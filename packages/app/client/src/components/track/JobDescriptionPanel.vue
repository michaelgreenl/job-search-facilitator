<script setup lang="ts">
import type { JobPost, JobPostSnapshot } from '@job-search-facilitator/core'
import BasePanel from '@/components/base/BasePanel.vue'

defineProps<{
    active: boolean
    post: JobPost
    snapshot: JobPostSnapshot
}>()

const emit = defineEmits<{
    back: []
}>()
</script>

<template>
    <BasePanel
        as="aside"
        class="job-description-panel glass-frame"
        :active="active"
        :adjacent="false"
        :eyebrow="post.company"
        :title="post.roleTitle"
        back-label="Back to application"
        back-test-id="back-from-job-description"
        :back-mobile-only="true"
        @back="emit('back')"
    >
        <article class="description-copy" data-testid="job-description-text">
            {{ snapshot.description }}
        </article>
    </BasePanel>
</template>

<style scoped lang="scss">
.job-description-panel {
    min-width: 0;
}

.description-copy {
    min-height: 0;
    padding: 0 $space-2 $space-5 0;
    overflow-y: auto;
    color: $color-ink-secondary;
    font-size: 0.9375rem;
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>
