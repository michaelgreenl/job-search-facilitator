import type { ApplyQueueItem, JobPost, UpdateJobPostInput } from '@job-search-facilitator/core'
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
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
}

const missingPostId = '22222222-2222-4222-8222-222222222222'
const applyQueueItem: ApplyQueueItem = {
    post: { ...existingPost, userLabel: 'P1' },
    recommendationContext: null,
}

const createFakeRepository = () => {
    const findMany = vi.fn(async () => [existingPost])
    const findApplyQueue = vi.fn(async () => [applyQueueItem])
    const findById = vi.fn(async (_id: string): Promise<JobPost | null> => existingPost)
    const update = vi.fn(async (_id: string, input: UpdateJobPostInput) => ({
        post: { ...existingPost, ...input },
        inApplyQueue: false,
    }))
    const repository: JobPostRepository = {
        findMany,
        findApplyQueue,
        findById,
        update,
    }

    return { findApplyQueue, findById, findMany, repository, update }
}

const createTestApp = (repository: JobPostRepository) => {
    const app = express()
    app.use(express.json())
    app.use('/job-posts', createJobPostRouter(repository))
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
