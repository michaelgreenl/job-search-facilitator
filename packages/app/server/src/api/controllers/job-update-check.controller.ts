import {
    BAD_REQUEST,
    parseJobUpdateCheckResult,
    parseRecordedJobUpdateChange,
} from '@job-search-facilitator/core'
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

    updates: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.listUpdates())
    },

    changeUpdates: async (request: Request, response: Response): Promise<void> => {
        let change

        try {
            change = parseRecordedJobUpdateChange(request.body)
        } catch {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        await repository.changeUpdates(change)
        response.status(204).end()
    },
})
