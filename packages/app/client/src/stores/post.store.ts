import {
    parseApplyQueueItems,
    parseJobPost,
    parseJobPosts,
    parseUpdateJobPostResult,
    type ApplyQueueItem,
    type JobPost,
    type UpdateJobPostInput,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { request } from '@/api'

const getJobPosts = () => request('/job-posts', parseJobPosts)

const getApplyQueue = () => request('/job-posts/apply-queue', parseApplyQueueItems)

const getJobPost = (id: string) => request(`/job-posts/${encodeURIComponent(id)}`, parseJobPost)

const patchJobPost = (id: string, input: UpdateJobPostInput) =>
    request(`/job-posts/${encodeURIComponent(id)}`, parseUpdateJobPostResult, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

export const usePostStore = defineStore('posts', () => {
    const posts = ref<JobPost[]>([])
    const loading = shallowRef(false)
    const error = shallowRef<string | null>(null)

    function savePost(post: JobPost) {
        const currentPost = posts.value.find(({ id }) => id === post.id)

        if (currentPost === undefined) {
            posts.value.push(post)
            return posts.value.at(-1)!
        }

        // Equal or older responses cannot replace a canonical revision already in memory.
        if (Date.parse(currentPost.updatedAt) < Date.parse(post.updatedAt)) {
            Object.assign(currentPost, post)
        }

        return currentPost
    }

    const upsertPost = (post: JobPost) => savePost(post)

    const upsertPosts = (loadedPosts: JobPost[]) => loadedPosts.map(upsertPost)

    const upsertApplyQueue = (items: ApplyQueueItem[]) =>
        items.map((item) => ({
            ...item,
            post: upsertPost(item.post),
        }))

    async function load<T>(getValue: () => Promise<T>, saveValue: (value: T) => T) {
        loading.value = true
        error.value = null

        try {
            return saveValue(await getValue())
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    const fetchPosts = () => load(getJobPosts, upsertPosts)

    const fetchApplyQueue = () => load(getApplyQueue, upsertApplyQueue)

    const fetchPost = (id: string) => load(() => getJobPost(id), upsertPost)

    async function updatePost(id: string, input: UpdateJobPostInput) {
        loading.value = true
        error.value = null

        try {
            const result = await patchJobPost(id, input)
            return {
                ...result,
                post: savePost(result.post),
            }
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    const findPost = (id: string) => posts.value.find((post) => post.id === id) ?? null

    return {
        posts,
        loading,
        error,
        fetchPosts,
        fetchApplyQueue,
        fetchPost,
        updatePost,
        findPost,
        upsertPost,
    }
})
