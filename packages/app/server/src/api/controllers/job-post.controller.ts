import type { Request, Response } from 'express'
import { BAD_REQUEST, NOT_FOUND } from '@job-search-facilitator/utils'
import type { JobPostRepository } from '../../db/repositories/job-post.repository.ts'
import { jobPostIdParamsSchema, updateJobPostInputSchema } from '../schemas/job-post.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }

export const createJobPostController = (repository: JobPostRepository) => ({
    list: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findMany())
    },

    listLabeled: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findLabeled())
    },

    getById: async (request: Request, response: Response): Promise<void> => {
        const params = jobPostIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const post = await repository.findById(params.data.id)

        if (post === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.json(post)
    },

    updateById: async (request: Request, response: Response): Promise<void> => {
        const params = jobPostIdParamsSchema.safeParse(request.params)
        const input = updateJobPostInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const post = await repository.update(params.data.id, input.data)

        if (post === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.json(post)
    },
})
