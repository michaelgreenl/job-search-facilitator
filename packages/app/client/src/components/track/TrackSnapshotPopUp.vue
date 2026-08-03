<script setup lang="ts">
import { computed } from 'vue'
import BasePopUp from '@/components/base/BasePopUp.vue'

const props = defineProps<{
    capturedAt: string
    content: string
    kind: 'application' | 'job-post'
    open: boolean
    sourceUrl: string
}>()

const emit = defineEmits<{ close: [] }>()
const heading = computed(() =>
    props.kind === 'application' ? 'Captured application' : 'Captured job post',
)
const capturedLabel = computed(() => new Date(props.capturedAt).toLocaleString())
</script>

<template>
    <BasePopUp
        class="snapshot-pop-up"
        :heading="heading"
        :open="open"
        close-test-id="close-snapshot"
        @close="emit('close')"
    >
        <div class="snapshot-meta">
            <span>Captured {{ capturedLabel }}</span>
            <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">Open source ↗</a>
        </div>
        <pre class="snapshot-content" data-testid="snapshot-content">{{ content }}</pre>
    </BasePopUp>
</template>

<style scoped lang="scss">
.snapshot-pop-up {
    width: min(52rem, calc(100vw - (#{$space-6} * 2)));
    max-height: calc(100dvh - (#{$space-6} * 2));
}

.snapshot-meta {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2 $space-4;
    justify-content: space-between;
    color: $color-ink-muted;
    font-size: 0.75rem;

    a {
        color: $color-signal-light;
    }
}

.snapshot-content {
    max-height: 70dvh;
    padding: $space-4;
    margin: $space-3 0 0;
    overflow: auto;
    color: $color-ink-secondary;
    font: inherit;
    font-size: 0.875rem;
    line-height: 1.55;
    white-space: pre-wrap;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}
</style>
