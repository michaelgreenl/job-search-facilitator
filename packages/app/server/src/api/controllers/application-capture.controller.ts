import { applicationCaptureResultSchema } from '@job-search-facilitator/core'
import { BAD_REQUEST, NOT_FOUND, OK_NO_CONTENT } from '@job-search-facilitator/utils'
import type { Request, Response } from 'express'
import type { ApplicationCaptureRepository } from '../../db/repositories/application-capture.repository.ts'
import { jobPostIdParamsSchema } from '../schemas/job-post.schema.ts'

export const createApplicationCaptureController = (repository: ApplicationCaptureRepository) => ({
    save: async (request: Request, response: Response): Promise<void> => {
        const params = jobPostIdParamsSchema.safeParse(request.params)
        const capture = applicationCaptureResultSchema.safeParse(request.body)

        if (!params.success || !capture.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        const saved = await repository.save(params.data.id, capture.data)

        if (!saved) {
            response.status(NOT_FOUND).json({ error: 'Job post not found' })
            return
        }

        response.sendStatus(OK_NO_CONTENT)
    },
})
