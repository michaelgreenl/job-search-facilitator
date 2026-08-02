<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import { usePostStore } from '@/stores/post'

const postStore = usePostStore()
const trackPostIds = shallowRef<readonly string[]>([])
const selectedPostId = shallowRef<string | null>(null)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)

const trackPosts = computed(() =>
    trackPostIds.value.flatMap((postId) => {
        const post = postStore.findPost(postId)
        return post === null ? [] : [post]
    }),
)

async function loadTrackedPosts() {
    loading.value = true
    error.value = null

    try {
        const posts = await postStore.fetchTrackedPosts()
        trackPostIds.value = posts.map(({ id }) => id)
    } catch (requestError) {
        error.value =
            requestError instanceof Error ? requestError.message : 'Could not load applications'
    } finally {
        loading.value = false
    }
}

onMounted(() => void loadTrackedPosts())
</script>

<template>
    <section class="track-layout" aria-label="Application tracking">
        <JobPostListPanel
            class="track-post-list glass-frame"
            data-testid="track-posts-panel"
            active
            :adjacent="false"
            eyebrow="Tracked"
            title="Applications"
            title-tag="h1"
            :posts="trackPosts"
            :selected-post-id="selectedPostId"
            :loading="loading"
            :error="error"
            loading-message="Loading applications…"
            empty-message="No applied or contacted job posts to track."
            @select="selectedPostId = $event"
            @retry="loadTrackedPosts"
        >
            <template #heading-controls>
                <span class="item-count">{{ trackPosts.length }} posts</span>
            </template>
        </JobPostListPanel>
    </section>
</template>

<style scoped lang="scss">
.track-layout {
    display: flex;
    flex: 1;
    max-height: calc(100dvh - ($space-3 * 2));
    min-height: 0;
}

.track-post-list {
    max-width: 36rem;
}

.item-count {
    color: $color-ink-muted;
    font-size: 0.75rem;
}
</style>
