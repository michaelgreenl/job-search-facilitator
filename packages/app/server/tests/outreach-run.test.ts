import type {
    CreateOutreachRunInput,
    OutreachRun,
    UpdateOutreachRunInput,
} from '@job-search-facilitator/core'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createOutreachRunRouter } from '../src/api/routes/outreach.route.ts'
import type { OutreachRunRepository } from '../src/db/repositories/outreach.repository.ts'

const existingRun: OutreachRun = {
    id: '11111111-1111-4111-8111-111111111111',
    jobPostId: '22222222-2222-4222-8222-222222222222',
    requestedContactCount: 2,
    status: 'pending',
    agentTaskId: null,
    agentThreadId: null,
    agentTurnId: null,
    error: null,
    completedAt: null,
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
}

const createTestApp = (repository: OutreachRunRepository) => {
    const app = express()
    app.use(express.json())
    app.use('/outreach-runs', createOutreachRunRouter(repository))
    return app
}

const createFakeRepository = () => {
    const create = vi.fn(
        async (input: CreateOutreachRunInput): Promise<OutreachRun | null> => ({
            ...existingRun,
            ...input,
        }),
    )
    const update = vi.fn(
        async (_id: string, input: UpdateOutreachRunInput): Promise<OutreachRun | null> => ({
            ...existingRun,
            ...input,
        }),
    )
    const repository: OutreachRunRepository = {
        create,
        findById: async (id) => (id === existingRun.id ? existingRun : null),
        update,
    }

    return { repository, create, update }
}

describe('outreach run routes', () => {
    it.each([2, 3] as const)('creates a run for %i requested contacts', async (count) => {
        const { repository, create } = createFakeRepository()
        const input: CreateOutreachRunInput = {
            jobPostId: existingRun.jobPostId,
            requestedContactCount: count,
        }

        await request(createTestApp(repository))
            .post('/outreach-runs')
            .send(input)
            .expect(201, { ...existingRun, ...input })

        expect(create).toHaveBeenCalledExactlyOnceWith(input)
    })

    it.each([
        [
            'an unsupported contact count',
            { jobPostId: existingRun.jobPostId, requestedContactCount: 4 },
        ],
        ['an extra field', { ...existingRun, requestedContactCount: 2 }],
    ])('rejects %s', async (_description, input) => {
        const { repository, create } = createFakeRepository()

        await request(createTestApp(repository)).post('/outreach-runs').send(input).expect(400)

        expect(create).not.toHaveBeenCalled()
    })

    it('returns 404 when the job post does not exist', async () => {
        const { repository } = createFakeRepository()
        repository.create = async () => null

        await request(createTestApp(repository))
            .post('/outreach-runs')
            .send({ jobPostId: existingRun.jobPostId, requestedContactCount: 2 })
            .expect(404)
    })

    it('gets a run by id', async () => {
        const { repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get(`/outreach-runs/${existingRun.id}`)
            .expect(200, existingRun)
    })

    it('records the Agent thread and turn when a run starts', async () => {
        const { repository, update } = createFakeRepository()
        const input: UpdateOutreachRunInput = {
            status: 'running',
            agentTaskId: '33333333-3333-4333-8333-333333333333',
            agentThreadId: 'thread-id',
            agentTurnId: 'turn-id',
        }

        await request(createTestApp(repository))
            .patch(`/outreach-runs/${existingRun.id}`)
            .send(input)
            .expect(200, { ...existingRun, ...input })

        expect(update).toHaveBeenCalledExactlyOnceWith(existingRun.id, input)
    })

    it.each([
        ['running without task ids', { status: 'running' }],
        ['completed with an error', { status: 'completed', error: 'Unexpected' }],
        ['failed without an error', { status: 'failed' }],
    ])('rejects a run marked %s', async (_description, input) => {
        const { repository, update } = createFakeRepository()

        await request(createTestApp(repository))
            .patch(`/outreach-runs/${existingRun.id}`)
            .send(input)
            .expect(400)

        expect(update).not.toHaveBeenCalled()
    })
})
