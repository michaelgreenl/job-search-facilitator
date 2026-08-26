import type {
    ApplyQueueItem,
    CreateUserAddedJobPostInput,
    JobPost,
    TrackedJobPost,
    UpdateJobPostInput,
    UserAddedJobPost,
} from '@job-search-facilitator/core'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createJobPostRouter } from '../src/api/routes/job-post.route.ts'
import type { JobPostRepository } from '../src/db/repositories/job-post.repository.ts'

const existingPost: JobPost = {
    id: '11111111-1111-4111-8111-111111111111',
    sourceKey: 'example-source:123',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Detroit, MI',
    compensation: '$120,000',
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Example Source',
    postUrl: 'https://example.com/jobs/123',
    applicationUrl: 'https://apply.example.com/jobs/123',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    appliedAt: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
}

const missingPostId = '22222222-2222-4222-8222-222222222222'
const applyQueueItem: ApplyQueueItem = {
    post: { ...existingPost, userLabel: 'P1' },
    jobPostSnapshot: null,
    recommendationContext: null,
    applicationArtifacts: [],
}
const trackedPost: TrackedJobPost = {
    post: {
        ...existingPost,
        applicationStatus: 'awaiting-response',
        appliedAt: '2026-07-12T10:00:00.000Z',
    },
    contacts: [],
    jobPostSnapshot: null,
    applicationArtifacts: [],
    activities: [],
}
const userAddedPost: UserAddedJobPost = {
    agentLabel: 'target',
    fitRationale: 'Strong TypeScript experience',
    applicationFlow: 'Direct company application',
    keyLegitimacySignals: 'Listed on the company careers page',
    recommendedResume: 'frontend',
    recommendedAction: 'Apply today',
    legitimacyNotes: null,
    post: existingPost,
    jobPostSnapshot: null,
    addedAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
}
const createUserAddedPostInput: CreateUserAddedJobPostInput = {
    agentLabel: userAddedPost.agentLabel,
    fitRationale: userAddedPost.fitRationale,
    applicationFlow: userAddedPost.applicationFlow,
    keyLegitimacySignals: userAddedPost.keyLegitimacySignals,
    recommendedResume: userAddedPost.recommendedResume,
    recommendedAction: userAddedPost.recommendedAction,
    legitimacyNotes: userAddedPost.legitimacyNotes,
    post: {
        sourceKey: existingPost.sourceKey,
        description: 'Complete job description',
        roleTitle: existingPost.roleTitle,
        company: existingPost.company,
        location: existingPost.location,
        compensation: existingPost.compensation,
        techStack: existingPost.techStack,
        postSource: existingPost.postSource,
        postUrl: existingPost.postUrl,
        applicationUrl: existingPost.applicationUrl,
        postStatus: existingPost.postStatus,
    },
}

const createFakeRepository = () => {
    const findMany = vi.fn(async () => [existingPost])
    const findApplyQueue = vi.fn(async () => [applyQueueItem])
    const findTracked = vi.fn(async () => [trackedPost])
    const findUserAdded = vi.fn(async () => [userAddedPost])
    const findById = vi.fn(async (_id: string): Promise<JobPost | null> => existingPost)
    const upsertUserAdded = vi.fn(async (_input: CreateUserAddedJobPostInput) => ({
        item: userAddedPost,
        created: true,
    }))
    const removeUserAdded = vi.fn(async (_id: string) => true)
    const update = vi.fn(async (_id: string, input: UpdateJobPostInput) => ({
        post: { ...existingPost, ...input },
        inApplyQueue: false,
    }))
    const repository: JobPostRepository = {
        findMany,
        findApplyQueue,
        findTracked,
        findUserAdded,
        findById,
        upsertUserAdded,
        removeUserAdded,
        update,
    }

    return {
        findApplyQueue,
        findTracked,
        findById,
        findMany,
        findUserAdded,
        repository,
        removeUserAdded,
        update,
        upsertUserAdded,
    }
}

const createTestApp = (repository: JobPostRepository) => {
    const app = express()
    app.use(express.json())
    app.use(
        '/job-posts',
        createJobPostRouter(repository, {
            save: vi.fn(async () => null),
            findFile: vi.fn(async () => null),
            remove: vi.fn(async () => false),
        }),
    )
    return app
}

describe('job post routes', () => {
    it('lists job posts', async () => {
        const { findMany, repository } = createFakeRepository()

        await request(createTestApp(repository)).get('/job-posts').expect(200, [existingPost])

        expect(findMany).toHaveBeenCalledOnce()
    })

    it('lists posts in the Apply queue', async () => {
        const { findApplyQueue, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get('/job-posts/apply-queue')
            .expect(200, [applyQueueItem])

        expect(findApplyQueue).toHaveBeenCalledOnce()
    })

    it('lists tracked posts', async () => {
        const { findTracked, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get('/job-posts/tracked')
            .expect(200, [trackedPost])

        expect(findTracked).toHaveBeenCalledOnce()
    })

    it('lists posts added by the user', async () => {
        const { findUserAdded, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get('/job-posts/user-added')
            .expect(200, [userAddedPost])

        expect(findUserAdded).toHaveBeenCalledOnce()
    })

    it('adds a new user-added post', async () => {
        const { repository, upsertUserAdded } = createFakeRepository()

        await request(createTestApp(repository))
            .post('/job-posts')
            .send(createUserAddedPostInput)
            .expect(201, userAddedPost)

        expect(upsertUserAdded).toHaveBeenCalledExactlyOnceWith(createUserAddedPostInput)
    })

    it('refreshes an existing user-added post', async () => {
        const { repository, upsertUserAdded } = createFakeRepository()
        upsertUserAdded.mockResolvedValueOnce({
            item: userAddedPost,
            created: false,
        })

        await request(createTestApp(repository))
            .post('/job-posts')
            .send(createUserAddedPostInput)
            .expect(200, userAddedPost)

        expect(upsertUserAdded).toHaveBeenCalledExactlyOnceWith(createUserAddedPostInput)
    })

    it('deletes a user-added job post', async () => {
        const { removeUserAdded, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .delete(`/job-posts/user-added/${existingPost.id}`)
            .expect(204)

        expect(removeUserAdded).toHaveBeenCalledExactlyOnceWith(existingPost.id)
    })

    it.each([
        ['a report-only recommendation field', { ...createUserAddedPostInput, agentRank: 1 }],
        [
            'a user-owned post field',
            {
                ...createUserAddedPostInput,
                post: {
                    ...createUserAddedPostInput.post,
                    applicationStatus: 'interviewing',
                },
            },
        ],
        [
            'an invalid listing URL',
            {
                ...createUserAddedPostInput,
                post: {
                    ...createUserAddedPostInput.post,
                    postUrl: 'ftp://example.com/jobs/123',
                },
            },
        ],
    ])('rejects %s without adding a post', async (_description, invalidInput) => {
        const { repository, upsertUserAdded } = createFakeRepository()

        await request(createTestApp(repository)).post('/job-posts').send(invalidInput).expect(400)

        expect(upsertUserAdded).not.toHaveBeenCalled()
    })

    it('gets a job post by id', async () => {
        const { findById, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get(`/job-posts/${existingPost.id}`)
            .expect(200, existingPost)

        expect(findById).toHaveBeenCalledExactlyOnceWith(existingPost.id)
    })

    it('forwards an allowed update and returns the updated post', async () => {
        const { repository, update } = createFakeRepository()
        const input: UpdateJobPostInput = {
            applicationStatus: 'interviewing',
            postStatus: 'closed',
            userLabel: 'forgo',
            archivedAt: '2026-07-12T12:00:00.000Z',
        }

        await request(createTestApp(repository))
            .patch(`/job-posts/${existingPost.id}`)
            .send(input)
            .expect(200, {
                post: { ...existingPost, ...input },
                inApplyQueue: false,
            })

        expect(update).toHaveBeenCalledExactlyOnceWith(existingPost.id, input)
    })

    it.each([
        ['an invalid field value', { archivedAt: 'not-a-date' }],
        ['an extra field', { roleTitle: 'Changed title' }],
        ['an empty body', {}],
    ])('rejects %s without updating', async (_description, input) => {
        const { repository, update } = createFakeRepository()

        await request(createTestApp(repository))
            .patch(`/job-posts/${existingPost.id}`)
            .send(input)
            .expect(400)

        expect(update).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing valid UUID', async () => {
        const { findById, repository } = createFakeRepository()
        findById.mockResolvedValueOnce(null)

        await request(createTestApp(repository)).get(`/job-posts/${missingPostId}`).expect(404)

        expect(findById).toHaveBeenCalledExactlyOnceWith(missingPostId)
    })
})
