import type { JobPost, UpdateJobPostInput } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { getJobPost, getJobPosts, patchJobPost } from '@/api'
import { useReportStore } from '@/stores/report.store'

export const usePostStore = defineStore('posts', {
    state: () => ({
        posts: [] as JobPost[],
        loading: false,
        error: null as string | null,
    }),
    actions: {
        async fetchPosts() {
            this.loading = true
            this.error = null

            try {
                this.posts = await getJobPosts()
            } catch (error) {
                this.error = error instanceof Error ? error.message : 'Request failed'
                throw error
            } finally {
                this.loading = false
            }
        },
        async fetchPost(id: string) {
            this.loading = true
            this.error = null

            try {
                const post = await getJobPost(id)
                this.savePost(post)
                return post
            } catch (error) {
                this.error = error instanceof Error ? error.message : 'Request failed'
                throw error
            } finally {
                this.loading = false
            }
        },
        async updatePost(id: string, input: UpdateJobPostInput) {
            this.loading = true
            this.error = null

            try {
                const post = await patchJobPost(id, input)
                this.savePost(post)
                return post
            } catch (error) {
                this.error = error instanceof Error ? error.message : 'Request failed'
                throw error
            } finally {
                this.loading = false
            }
        },
        savePost(post: JobPost) {
            const index = this.posts.findIndex(({ id }) => id === post.id)

            if (index === -1) {
                this.posts.push(post)
            } else {
                this.posts[index] = post
            }

            useReportStore().replacePost(post)
        },
    },
})
