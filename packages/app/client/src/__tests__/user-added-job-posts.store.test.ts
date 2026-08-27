import type {
    CreateUserAddedJobPostInput,
    JobPost,
    UserAddedJobPost,
} from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePostStore } from '../stores/post'
import { jsonResponse } from '@/test/support/http'

const post: JobPost = {
    id: '42a2193a-1fcc-4aa0-b8e7-976bd8f107eb',
    sourceKey: 'example:post-1',
    roleTitle: 'Software Engineer',
    company: 'Example Co',
    location: 'Remote',
    compensation: '$90,000–$120,000',
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: 'https://example.com/jobs/post-1',
    applicationUrl: 'https://apply.example.com/jobs/post-1',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    appliedAt: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
}

const userAddedPost: UserAddedJobPost = {
    agentLabel: 'target',
    fitRationale: 'Strong TypeScript and Vue fit',
    applicationFlow: 'Direct company application',
    keyLegitimacySignals: 'Live on the company careers site',
    recommendedResume: 'frontend',
    recommendedAction: 'Tailor the frontend resume and apply',
    legitimacyNotes: null,
    post,
    jobPostSnapshot: {
        description: 'Complete job description',
        sourceUrl: post.postUrl,
        capturedAt: '2026-07-27T12:00:00.000Z',
    },
    addedAt: '2026-07-27T12:00:00.000Z',
    updatedAt: '2026-07-27T12:00:00.000Z',
}

const createUserAddedPostInput: CreateUserAddedJobPostInput = {
    agentLabel: userAddedPost.agentLabel,
    fitRationale: userAddedPost.fitRationale,
    applicationFlow: userAddedPost.applicationFlow,
    keyLegitimacySignals: userAddedPost.keyLegitimacySignals,
    recommendedResume: 'frontend',
    recommendedAction: userAddedPost.recommendedAction,
    legitimacyNotes: userAddedPost.legitimacyNotes,
    post: {
        sourceKey: post.sourceKey,
        description: 'Complete job description',
        roleTitle: post.roleTitle,
        company: post.company,
        location: post.location,
        compensation: post.compensation,
        techStack: post.techStack,
        postSource: post.postSource,
        postUrl: post.postUrl,
        applicationUrl: post.applicationUrl,
        postStatus: post.postStatus,
    },
}

const membershipForPost = (id: string, addedAt: string): UserAddedJobPost => ({
    ...userAddedPost,
    post: {
        ...post,
        id,
        sourceKey: `example:${id}`,
        postUrl: `https://example.com/jobs/${id}`,
        applicationUrl: `https://apply.example.com/jobs/${id}`,
    },
    addedAt,
    updatedAt: addedAt,
})

describe('user-added posts in the post store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('loads user-added memberships with the canonical post object', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse([{ ...userAddedPost, post: { ...post } }]),
        )
        const store = usePostStore()
        const canonicalPost = store.upsertPost(post)

        const items = await store.fetchUserAddedPosts()

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            'http://127.0.0.1:3000/api/job-posts/user-added',
            undefined,
        )
        expect(items).toBe(store.userAddedPosts)
        expect(items[0]!.post).toBe(canonicalPost)
    })

    it('preserves user-added memberships when the API response is invalid', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse([
                {
                    ...userAddedPost,
                    post: { ...post, postUrl: 'javascript:alert(1)' },
                },
            ]),
        )
        const store = usePostStore()
        store.userAddedPosts = [userAddedPost]
        const existingItems = store.userAddedPosts

        await expect(store.fetchUserAddedPosts()).rejects.toThrow(
            'API /job-posts/user-added returned invalid data',
        )

        expect(store.userAddedPosts).toBe(existingItems)
    })

    it('saves the exact input and replaces the canonical membership in deterministic order', async () => {
        const tieItem = membershipForPost(
            '11111111-1111-4111-8111-111111111111',
            userAddedPost.addedAt,
        )
        const olderItem = membershipForPost(
            '99999999-9999-4999-8999-999999999999',
            '2026-07-26T12:00:00.000Z',
        )
        const previousItem = {
            ...userAddedPost,
            fitRationale: 'Previous evaluation',
            addedAt: '2026-07-25T12:00:00.000Z',
        }
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ ...userAddedPost, post: { ...post } }, 201))
        const store = usePostStore()
        store.userAddedPosts = [olderItem, previousItem, tieItem]
        const canonicalPost = store.upsertPost(post)

        const savedItem = await store.addUserAddedPost(createUserAddedPostInput)

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3000/api/job-posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createUserAddedPostInput),
        })
        expect(store.userAddedPosts.map((item) => item.post.id)).toEqual([
            tieItem.post.id,
            post.id,
            olderItem.post.id,
        ])
        expect(store.userAddedPosts.filter((item) => item.post.id === post.id)).toHaveLength(1)
        expect(savedItem).toBe(store.userAddedPosts[1])
        expect(savedItem.post).toBe(canonicalPost)
    })

    it('keeps a completed add when an older list request finishes afterward', async () => {
        const existingItem = membershipForPost(
            '99999999-9999-4999-8999-999999999999',
            '2026-07-26T12:00:00.000Z',
        )
        let resolveList: ((response: Response) => void) | undefined
        const staleList = new Promise<Response>((resolve) => {
            resolveList = resolve
        })
        vi.mocked(fetch).mockImplementation((input, init) => {
            const method = init?.method ?? 'GET'
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

            if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
                return staleList
            }

            if (method === 'POST' && url.endsWith('/job-posts')) {
                return Promise.resolve(jsonResponse(userAddedPost, 201))
            }

            throw new Error(`Unexpected ${method} request: ${url}`)
        })
        const store = usePostStore()

        const listRequest = store.fetchUserAddedPosts()
        await store.addUserAddedPost(createUserAddedPostInput)
        resolveList?.(jsonResponse([existingItem]))
        await listRequest

        expect(store.userAddedPosts.map((item) => item.post.id)).toEqual([
            userAddedPost.post.id,
            existingItem.post.id,
        ])
    })

    it('keeps a completed deletion when an older list request finishes afterward', async () => {
        let resolveList: ((response: Response) => void) | undefined
        const staleList = new Promise<Response>((resolve) => {
            resolveList = resolve
        })
        vi.mocked(fetch).mockImplementation((input, init) => {
            const method = init?.method ?? 'GET'
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

            if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
                return staleList
            }

            if (method === 'DELETE' && url.endsWith(`/job-posts/user-added/${post.id}`)) {
                return Promise.resolve(new Response(null, { status: 204 }))
            }

            throw new Error(`Unexpected ${method} request: ${url}`)
        })
        const store = usePostStore()
        store.userAddedPosts = [userAddedPost]
        store.upsertPost(post)

        const listRequest = store.fetchUserAddedPosts()
        await store.removeUserAddedPost(post.id)
        resolveList?.(jsonResponse([userAddedPost]))
        await listRequest

        expect(store.userAddedPosts).toEqual([])
        expect(store.findPost(post.id)).toBeNull()
    })

    it('preserves user-added memberships when a save response is invalid', async () => {
        const { addedAt: _addedAt, ...invalidResponse } = userAddedPost
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(invalidResponse, 201))
        const store = usePostStore()
        store.userAddedPosts = [userAddedPost]
        const existingItems = store.userAddedPosts

        await expect(store.addUserAddedPost(createUserAddedPostInput)).rejects.toThrow(
            'API /job-posts returned invalid data',
        )

        expect(store.userAddedPosts).toBe(existingItems)
    })
})
