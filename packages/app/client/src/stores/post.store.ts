import type { JobPost, UpdateJobPostInput } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { request } from '@/api'
import { useReportStore } from '@/stores/report.store'

const getJobPosts = () => request<JobPost[]>('/job-posts')

const getLabeledJobPosts = () => request<JobPost[]>('/job-posts/labeled')

const getJobPost = (id: string) => request<JobPost>(`/job-posts/${encodeURIComponent(id)}`)

const patchJobPost = (id: string, input: UpdateJobPostInput) =>
    request<JobPost>(`/job-posts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

export const usePostStore = defineStore('posts', () => {
    const posts = ref<JobPost[]>([])
    const loading = shallowRef(false)
    const error = shallowRef<string | null>(null)

    async function loadPosts(getPosts: () => Promise<JobPost[]>) {
        loading.value = true
        error.value = null

        try {
            posts.value = await getPosts()
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    const fetchPosts = () => loadPosts(getJobPosts)

    const fetchLabeledPosts = () => loadPosts(getLabeledJobPosts)

    async function fetchPost(id: string) {
        loading.value = true
        error.value = null

        try {
            const post = await getJobPost(id)
            savePost(post)
            return post
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    async function updatePost(id: string, input: UpdateJobPostInput) {
        loading.value = true
        error.value = null

        try {
            const post = await patchJobPost(id, input)
            savePost(post)
            return post
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    function savePost(post: JobPost) {
        const index = posts.value.findIndex(({ id }) => id === post.id)

        if (index === -1) {
            posts.value.push(post)
        } else {
            posts.value[index] = post
        }

        useReportStore().replacePost(post)
    }

    return {
        posts,
        loading,
        error,
        fetchPosts,
        fetchLabeledPosts,
        fetchPost,
        updatePost,
    }
})
