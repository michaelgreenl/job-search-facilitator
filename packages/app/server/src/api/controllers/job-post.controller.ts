import type { Request, Response } from 'express'
import { BAD_REQUEST, CREATED, NOT_FOUND, OK } from '@job-search-facilitator/core'
import type { JobPostRepository } from '../../db/repositories/job-post.repository.ts'
import {
    createUserAddedJobPostInputSchema,
    jobPostIdParamsSchema,
    updateJobPostInputSchema,
} from '../schemas/job-post.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }

export const createJobPostController = (repository: JobPostRepository) => ({
    list: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findMany())
    },

    listApplyQueue: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findApplyQueue())
    },

    listTracked: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findTracked())
    },

    listUserAdded: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findUserAdded())
    },

    createUserAdded: async (request: Request, response: Response): Promise<void> => {
        const input = createUserAddedJobPostInputSchema.safeParse(request.body)

        if (!input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const result = await repository.upsertUserAdded(input.data)

        response.status(result.created ? CREATED : OK).json(result.item)
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

        const updateResult = await repository.update(params.data.id, input.data)

        if (updateResult === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.json(updateResult)
    },
})
