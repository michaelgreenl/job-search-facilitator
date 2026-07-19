import type { Request, Response } from 'express'
import { BAD_REQUEST, CREATED, NOT_FOUND } from '@job-search-facilitator/utils'
import type { OutreachRunRepository } from '../../db/repositories/outreach-run.repository.ts'
import {
    createOutreachRunInputSchema,
    outreachRunIdParamsSchema,
    updateOutreachRunInputSchema,
} from '../schemas/outreach-run.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }
const outreachRunNotFound = { error: 'Outreach run not found' }

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
