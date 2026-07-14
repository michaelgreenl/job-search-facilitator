<script setup lang="ts">
import type { JobSearchResult } from '@job-search-facilitator/core'

defineProps<{
    result: JobSearchResult
}>()
</script>

<template>
    <section class="post-viewer" aria-labelledby="selected-post-title">
        <span class="component-label">Job post viewer</span>
        <div class="post-heading">
            <h2 id="selected-post-title" class="post-title">{{ result.post.roleTitle }}</h2>
            <p class="post-company">{{ result.post.company }}</p>
        </div>

        <div class="placeholder-content">
            <strong>Selected post: {{ result.post.id }}</strong>
            <p class="placeholder-copy">
                Detailed job information and review controls will appear in this panel.
            </p>
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

.post-title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2rem);
    line-height: 1.15;
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
