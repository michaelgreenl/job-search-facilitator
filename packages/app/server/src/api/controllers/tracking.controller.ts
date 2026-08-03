import { parseTrackingAutomationResult } from '@job-search-facilitator/core'
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from '@job-search-facilitator/utils'
import type { Request, Response } from 'express'
import type { TrackRepository } from '../../db/repositories/track.repository.ts'
import { saveNextStepInputSchema, trackingJobPostParamsSchema } from '../schemas/tracking.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const jobPostNotFound = { error: 'Job post not found' }

export const createTrackingController = (repository: TrackRepository) => ({
    list: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findTracked())
    },

    getAutomationContext: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findAutomationContext())
    },

    applyAutomationResult: async (request: Request, response: Response): Promise<void> => {
        let input

        try {
            input = parseTrackingAutomationResult(request.body)
        } catch {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const result = await repository.applyAutomationResult(input)

        if (result === null) {
            response.status(CONFLICT).json({ error: 'Tracking context is stale' })
            return
        }

        response.json(result)
    },

    saveNextStep: async (request: Request, response: Response): Promise<void> => {
        const params = trackingJobPostParamsSchema.safeParse(request.params)
        const input = saveNextStepInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const nextStep = await repository.saveNextStep(params.data.jobPostId, {
            ...input.data,
            sourceActivityId: null,
        })

        if (nextStep === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.json(nextStep)
    },
})
