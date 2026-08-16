import type { Request, Response } from 'express'
import { BAD_REQUEST, CREATED, NOT_FOUND } from '@job-search-facilitator/core'
import type {
    OutreachContactRepository,
    OutreachRunRepository,
} from '../../db/repositories/outreach.repository.ts'
import {
    createOutreachRunInputSchema,
    outreachContactInputSchema,
    outreachContactJobPostParamsSchema,
    outreachContactParamsSchema,
    outreachRunIdParamsSchema,
    updateOutreachContactInputSchema,
    updateOutreachRunInputSchema,
} from '../schemas/outreach.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }
const outreachContactNotFound = { error: 'Outreach contact not found' }
const outreachRunNotFound = { error: 'Outreach run not found' }

export const createOutreachContactController = (repository: OutreachContactRepository) => ({
    create: async (request: Request, response: Response): Promise<void> => {
        const params = outreachContactJobPostParamsSchema.safeParse(request.params)
        const input = outreachContactInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const contact = await repository.create(params.data.jobPostId, input.data)

        if (contact === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.status(CREATED).json(contact)
    },

    listByJobPost: async (request: Request, response: Response): Promise<void> => {
        const params = outreachContactJobPostParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        response.json(await repository.findByJobPostId(params.data.jobPostId))
    },

    removeById: async (request: Request, response: Response): Promise<void> => {
        const params = outreachContactParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        if (!(await repository.remove(params.data.jobPostId, params.data.contactId))) {
            response.status(NOT_FOUND).json(outreachContactNotFound)
            return
        }

        response.status(204).end()
    },

    updateById: async (request: Request, response: Response): Promise<void> => {
        const params = outreachContactParamsSchema.safeParse(request.params)
        const input = updateOutreachContactInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const contact = await repository.update(
            params.data.jobPostId,
            params.data.contactId,
            input.data,
        )

        if (contact === null) {
            response.status(NOT_FOUND).json(outreachContactNotFound)
            return
        }

        response.json(contact)
    },
})

export const createOutreachRunController = (repository: OutreachRunRepository) => ({
    create: async (request: Request, response: Response): Promise<void> => {
        const input = createOutreachRunInputSchema.safeParse(request.body)

        if (!input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const run = await repository.create(input.data)

        if (run === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.status(CREATED).json(run)
    },

    getById: async (request: Request, response: Response): Promise<void> => {
        const params = outreachRunIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const run = await repository.findById(params.data.runId)

        if (run === null) {
            response.status(NOT_FOUND).json(outreachRunNotFound)
            return
        }

        response.json(run)
    },

    updateById: async (request: Request, response: Response): Promise<void> => {
        const params = outreachRunIdParamsSchema.safeParse(request.params)
        const input = updateOutreachRunInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const run = await repository.update(params.data.runId, input.data)

        if (run === null) {
            response.status(NOT_FOUND).json(outreachRunNotFound)
            return
        }

        response.json(run)
    },
})
