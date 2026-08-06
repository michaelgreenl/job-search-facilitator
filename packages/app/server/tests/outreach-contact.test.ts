import type {
    OutreachContact,
    OutreachContactInput,
    UpdateOutreachContactInput,
} from '@job-search-facilitator/core'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createOutreachContactRouter } from '../src/api/routes/outreach.route.ts'
import type { OutreachContactRepository } from '../src/db/repositories/outreach.repository.ts'

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
    messagedAt: '2026-07-21T12:00:00.000Z',
    respondedAt: null,
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
        async (_postId: string, _input: OutreachContactInput): Promise<OutreachContact | null> => ({
            ...existingContact,
            messaged: false,
        }),
    )
    const findByJobPostId = vi.fn(async () => [existingContact])
    const remove = vi.fn(async () => true)
    const update = vi.fn(
        async (
            _postId: string,
            _contactId: string,
            input: UpdateOutreachContactInput,
        ): Promise<OutreachContact | null> => ({
            ...existingContact,
            messaged: input.messaged ?? existingContact.messaged,
            respondedAt:
                input.responded === undefined
                    ? existingContact.respondedAt
                    : input.responded
                      ? existingContact.updatedAt
                      : null,
        }),
    )
    const repository = { create, findByJobPostId, remove, update }

    return { create, findByJobPostId, remove, repository, update }
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

    it.each([true, false])('updates a saved contact messaged status to %s', async (messaged) => {
        const { repository, update } = createFakeRepository()

        await request(createTestApp(repository))
            .patch(`/job-posts/${jobPostId}/outreach-contacts/${existingContact.id}`)
            .send({ messaged })
            .expect(200, { ...existingContact, messaged })

        expect(update).toHaveBeenCalledExactlyOnceWith(jobPostId, existingContact.id, {
            messaged,
        })
    })

    it('removes a discovered contact', async () => {
        const { remove, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .delete(`/job-posts/${jobPostId}/outreach-contacts/${existingContact.id}`)
            .expect(204)

        expect(remove).toHaveBeenCalledExactlyOnceWith(jobPostId, existingContact.id)
    })

    it('returns 404 when removing a missing outreach contact', async () => {
        const { remove, repository } = createFakeRepository()
        remove.mockResolvedValueOnce(false)

        await request(createTestApp(repository))
            .delete(`/job-posts/${jobPostId}/outreach-contacts/${existingContact.id}`)
            .expect(404)
    })

    it.each([
        ['an invalid job post id', 'invalid-id', existingContact.id],
        ['an invalid contact id', jobPostId, 'invalid-id'],
    ])('rejects removal with %s', async (_description, postId, contactId) => {
        const { remove, repository } = createFakeRepository()

        await request(createTestApp(repository))
            .delete(`/job-posts/${postId}/outreach-contacts/${contactId}`)
            .expect(400)

        expect(remove).not.toHaveBeenCalled()
    })

    it.each([
        ['an invalid job post id', 'invalid-id', existingContact.id, { messaged: true }],
        ['an invalid contact id', jobPostId, 'invalid-id', { messaged: true }],
        ['a non-boolean status', jobPostId, existingContact.id, { messaged: 'yes' }],
        ['an extra field', jobPostId, existingContact.id, { messaged: true, personName: 'Grace' }],
        ['an empty body', jobPostId, existingContact.id, {}],
    ])('rejects an update with %s', async (_description, postId, contactId, input) => {
        const { repository, update } = createFakeRepository()

        await request(createTestApp(repository))
            .patch(`/job-posts/${postId}/outreach-contacts/${contactId}`)
            .send(input)
            .expect(400)

        expect(update).not.toHaveBeenCalled()
    })

    it('returns 404 when updating a missing outreach contact', async () => {
        const { repository, update } = createFakeRepository()
        update.mockResolvedValueOnce(null)

        await request(createTestApp(repository))
            .patch(`/job-posts/${jobPostId}/outreach-contacts/${existingContact.id}`)
            .send({ messaged: true })
            .expect(404)
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
            .expect(400)

        expect(create).not.toHaveBeenCalled()
    })

    it('returns 404 when saving against a missing job post', async () => {
        const { create, repository } = createFakeRepository()
        create.mockResolvedValueOnce(null)

        await request(createTestApp(repository))
            .post(`/job-posts/${jobPostId}/outreach-contacts`)
            .send(contactInput)
            .expect(404)
    })
})
