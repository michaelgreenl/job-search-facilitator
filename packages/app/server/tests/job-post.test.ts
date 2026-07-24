import type { JobPost, UpdateJobPostInput } from '@job-search-facilitator/core'
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

const createFakeRepository = (initialPosts: JobPost[]) => {
    const posts = [...initialPosts]
    const update = vi.fn(async (id: string, input: UpdateJobPostInput) => {
        const index = posts.findIndex((post) => post.id === id)

        if (index === -1) {
            return null
        }

        const updatedPost: JobPost = {
            ...posts[index],
            ...input,
            updatedAt: '2026-07-12T11:00:00.000Z',
        }
        posts[index] = updatedPost

        return updatedPost
    })
    const repository: JobPostRepository = {
        findMany: async () => [...posts],
        findLabeled: async () =>
            posts.filter(({ userLabel }) => userLabel !== null && userLabel !== 'forgo'),
        findById: async (id) => posts.find((post) => post.id === id) ?? null,
        update,
    }

    return { repository, update }
}

const createTestApp = (repository: JobPostRepository) => {
    const app = express()
    app.use(express.json())
    app.use('/job-posts', createJobPostRouter(repository))
    return app
}

describe('job post routes', () => {
    it('lists job posts', async () => {
        const { repository } = createFakeRepository([existingPost])

        await request(createTestApp(repository)).get('/job-posts').expect(200, [existingPost])
    })

    it('lists labeled job posts without forgone or unlabeled posts', async () => {
        const labeledPost: JobPost = { ...existingPost, userLabel: 'P1' }
        const forgonePost: JobPost = {
            ...existingPost,
            id: '22222222-2222-4222-8222-222222222222',
            userLabel: 'forgo',
        }
        const unlabeledPost: JobPost = {
            ...existingPost,
            id: '33333333-3333-4333-8333-333333333333',
        }
        const { repository } = createFakeRepository([labeledPost, forgonePost, unlabeledPost])

        await request(createTestApp(repository))
            .get('/job-posts/labeled')
            .expect(200, [labeledPost])
    })

    it('forwards an allowed update and returns the updated post', async () => {
        const { repository, update } = createFakeRepository([existingPost])
        const input: UpdateJobPostInput = {
            applicationStatus: 'interviewing',
            postStatus: 'closed',
            userLabel: 'forgo',
            archivedAt: '2026-07-12T12:00:00.000Z',
        }

        const response = await request(createTestApp(repository))
            .patch(`/job-posts/${existingPost.id}`)
            .send(input)
            .expect(200)

        expect(update).toHaveBeenCalledExactlyOnceWith(existingPost.id, input)
        expect(response.body).toEqual({
            ...existingPost,
            ...input,
            updatedAt: '2026-07-12T11:00:00.000Z',
        })
    })

    it.each([
        ['an invalid field value', { archivedAt: 'not-a-date' }],
        ['an extra field', { roleTitle: 'Changed title' }],
        ['an empty body', {}],
    ])('rejects %s without updating', async (_description, input) => {
        const { repository, update } = createFakeRepository([existingPost])

        await request(createTestApp(repository))
            .patch(`/job-posts/${existingPost.id}`)
            .send(input)
            .expect(400, { error: 'Invalid request' })

        expect(update).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing valid UUID', async () => {
        const { repository } = createFakeRepository([existingPost])

        await request(createTestApp(repository))
            .get(`/job-posts/${missingPostId}`)
            .expect(404, { error: 'Job post not found' })
    })
})
