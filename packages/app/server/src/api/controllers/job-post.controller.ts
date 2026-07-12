import type { Request, Response } from 'express'
import type { JobPostRepository } from '../../db/repositories/job-post.repository.ts'
import { jobPostIdParamsSchema, updateJobPostInputSchema } from '../schemas/job-post.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }

export const createJobPostController = (repository: JobPostRepository) => ({
    list: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findMany())
    },

    getById: async (request: Request, response: Response): Promise<void> => {
        const params = jobPostIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(400).json(invalidRequest)
            return
        }

        const post = await repository.findById(params.data.id)

        if (post === null) {
            response.status(404).json(jobPostNotFound)
            return
        }

        response.json(post)
    },

    updateById: async (request: Request, response: Response): Promise<void> => {
        const params = jobPostIdParamsSchema.safeParse(request.params)
        const input = updateJobPostInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(400).json(invalidRequest)
            return
        }

        const post = await repository.update(params.data.id, input.data)

        if (post === null) {
            response.status(404).json(jobPostNotFound)
            return
        }

        response.json(post)
    },
})
