import type { Request, Response } from 'express'
import { BAD_REQUEST, CREATED, NOT_FOUND } from '@job-search-facilitator/utils'
import type { OutreachContactRepository } from '../../db/repositories/outreach-contact.repository.ts'
import {
    outreachContactInputSchema,
    outreachContactJobPostParamsSchema,
} from '../schemas/outreach-contact.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }

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
})
