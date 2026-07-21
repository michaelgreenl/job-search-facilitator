import type { OutreachContact, OutreachContactInput } from '@job-search-facilitator/core'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createOutreachContactRouter } from '../src/api/routes/outreach-contact.route.ts'
import type { OutreachContactRepository } from '../src/db/repositories/outreach-contact.repository.ts'

const jobPostId = '22222222-2222-4222-8222-222222222222'
const existingContact: OutreachContact = {
    id: '11111111-1111-4111-8111-111111111111',
    jobPostId,
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale: 'Her visible role aligns with the position.',
    draftMessage: 'Hi Ada, I would value your perspective on the role.',
    messaged: true,
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
}
const contactInput: OutreachContactInput = {
    personName: existingContact.personName,
    personTitle: existingContact.personTitle,
    profileUrl: existingContact.profileUrl,
    relevanceRationale: existingContact.relevanceRationale,
    draftMessage: existingContact.draftMessage,
}

const createTestApp = (repository: OutreachContactRepository) => {
    const app = express()
    app.use(express.json())
    app.use('/job-posts/:jobPostId/outreach-contacts', createOutreachContactRouter(repository))
    return app
}

const createFakeRepository = () => {
    const create = vi.fn(
        async (postId: string, input: OutreachContactInput): Promise<OutreachContact | null> => ({
            ...existingContact,
            ...input,
            jobPostId: postId,
            messaged: false,
        }),
    )
    const findByJobPostId = vi.fn(async () => [existingContact])
    const repository: OutreachContactRepository = { create, findByJobPostId }

    return { create, findByJobPostId, repository }
}

describe('outreach contact routes', () => {
    it('lists previously discovered contacts for a job post', async () => {
        const { findByJobPostId, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .get(`/job-posts/${jobPostId}/outreach-contacts`)
            .expect(200, [existingContact])

        expect(findByJobPostId).toHaveBeenCalledExactlyOnceWith(jobPostId)
    })

    it('saves a discovered contact for a job post', async () => {
        const { create, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .post(`/job-posts/${jobPostId}/outreach-contacts`)
            .send(contactInput)
            .expect(201, { ...existingContact, messaged: false })

        expect(create).toHaveBeenCalledExactlyOnceWith(jobPostId, contactInput)
    })

    it.each([
        ['an invalid job post id', 'invalid-id', contactInput],
        [
            'a non-LinkedIn profile URL',
            jobPostId,
            { ...contactInput, profileUrl: 'https://example.com/ada-lovelace' },
        ],
        ['a client-provided messaged status', jobPostId, { ...contactInput, messaged: true }],
    ])('rejects %s', async (_description, postId, input) => {
        const { create, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .post(`/job-posts/${postId}/outreach-contacts`)
            .send(input)
            .expect(400, { error: 'Invalid request' })

        expect(create).not.toHaveBeenCalled()
    })

    it('returns 404 when saving against a missing job post', async () => {
        const { repository } = createFakeRepository()
        repository.create = async () => null

        await request(createTestApp(repository))
            .post(`/job-posts/${jobPostId}/outreach-contacts`)
            .send(contactInput)
            .expect(404, { error: 'Job post not found' })
    })
})
