import {
    parseApplyQueueItems,
    parseJobPost,
    parseJobPosts,
    parseUserAddedJobPost,
    parseUserAddedJobPosts,
    parseUpdateJobPostResult,
    type ApplyQueueItem,
    type CreateUserAddedJobPostInput,
    type JobPost,
    type UpdateJobPostInput,
    type UserAddedJobPost,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { request } from '@/api'

const getJobPosts = () => request('/job-posts', parseJobPosts)

const getApplyQueue = () => request('/job-posts/apply-queue', parseApplyQueueItems)

const getUserAddedPosts = () => request('/job-posts/user-added', parseUserAddedJobPosts)

const postUserAddedPost = (input: CreateUserAddedJobPostInput) =>
    request('/job-posts', parseUserAddedJobPost, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

const getJobPost = (id: string) => request(`/job-posts/${encodeURIComponent(id)}`, parseJobPost)

const patchJobPost = (id: string, input: UpdateJobPostInput) =>
    request(`/job-posts/${encodeURIComponent(id)}`, parseUpdateJobPostResult, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

interface AddPostDialogState {
    open: boolean
    url: string
}

const emptyAddPostDialog = (): AddPostDialogState => ({ open: false, url: '' })

export const usePostStore = defineStore('posts', () => {
    const posts = ref<JobPost[]>([])
    const userAddedPosts = ref<UserAddedJobPost[]>([])
    const addPostDialog = shallowRef<AddPostDialogState>(emptyAddPostDialog())
    const loading = shallowRef(false)
    const error = shallowRef<string | null>(null)
    const userAddedMutationRevisions = new Map<string, number>()
    let userAddedMutationRevision = 0

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

    const canonicalizeUserAddedPost = (item: UserAddedJobPost) => ({
        ...item,
        post: upsertPost(item.post),
    })

    const sortUserAddedPosts = (items: UserAddedJobPost[]) =>
        items.sort(
            (left, right) =>
                Date.parse(right.addedAt) - Date.parse(left.addedAt) ||
                left.post.id.localeCompare(right.post.id),
        )

    const replaceUserAddedPosts = (
        items: UserAddedJobPost[],
        requestMutationRevision = userAddedMutationRevision,
    ) => {
        const itemsByPostId = new Map(
            items.map(canonicalizeUserAddedPost).map((item) => [item.post.id, item]),
        )

        for (const currentItem of userAddedPosts.value) {
            if (
                (userAddedMutationRevisions.get(currentItem.post.id) ?? 0) > requestMutationRevision
            ) {
                itemsByPostId.set(currentItem.post.id, currentItem)
            }
        }

        userAddedPosts.value = sortUserAddedPosts([...itemsByPostId.values()])

        return userAddedPosts.value
    }

    const saveUserAddedPost = (item: UserAddedJobPost) => {
        const savedItem = canonicalizeUserAddedPost(item)
        userAddedMutationRevisions.set(savedItem.post.id, ++userAddedMutationRevision)
        userAddedPosts.value = sortUserAddedPosts([
            ...userAddedPosts.value.filter(
                (currentItem) => currentItem.post.id !== savedItem.post.id,
            ),
            savedItem,
        ])

        return userAddedPosts.value.find(
            (currentItem) => currentItem.post.id === savedItem.post.id,
        )!
    }

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

    const fetchUserAddedPosts = () => {
        const requestMutationRevision = userAddedMutationRevision

        return load(getUserAddedPosts, (items) =>
            replaceUserAddedPosts(items, requestMutationRevision),
        )
    }

    const addUserAddedPost = (input: CreateUserAddedJobPostInput) =>
        load(() => postUserAddedPost(input), saveUserAddedPost)

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

    function saveAddPostDialog(state: AddPostDialogState) {
        addPostDialog.value = state
    }

    function openAddPostDialog() {
        saveAddPostDialog({ ...addPostDialog.value, open: true })
    }

    function closeAddPostDialog() {
        saveAddPostDialog({ ...addPostDialog.value, open: false })
    }

    function setAddPostUrl(url: string) {
        saveAddPostDialog({ ...addPostDialog.value, url })
    }

    function clearAddPostDialog() {
        saveAddPostDialog(emptyAddPostDialog())
    }

    return {
        posts,
        userAddedPosts,
        addPostDialog,
        loading,
        error,
        fetchPosts,
        fetchApplyQueue,
        fetchUserAddedPosts,
        addUserAddedPost,
        fetchPost,
        updatePost,
        findPost,
        upsertPost,
        openAddPostDialog,
        closeAddPostDialog,
        setAddPostUrl,
        clearAddPostDialog,
    }
})
