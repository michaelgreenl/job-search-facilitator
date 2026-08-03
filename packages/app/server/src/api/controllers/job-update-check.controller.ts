import { parseJobUpdateCheckResult } from '@job-search-facilitator/core'
import { BAD_REQUEST } from '@job-search-facilitator/utils'
import type { Request, Response } from 'express'
import type { JobUpdateCheckRepository } from '../../db/repositories/job-update-check.repository.ts'

export const createJobUpdateCheckController = (repository: JobUpdateCheckRepository) => ({
    context: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.getContext())
    },

    save: async (request: Request, response: Response): Promise<void> => {
        let result

        try {
            result = parseJobUpdateCheckResult(request.body)
        } catch {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        const saved = await repository.save(result)
        response.json(saved)
    },
})
