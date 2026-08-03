import express from 'express'
import type { TrackRepository } from '../../db/repositories/track.repository.ts'
import { createTrackingController } from '../controllers/tracking.controller.ts'

export const createTrackingRouter = (repository: TrackRepository) => {
    const router = express.Router()
    const controller = createTrackingController(repository)

    router.get('/', controller.list)
    router.get('/automation-context', controller.getAutomationContext)
    router.post('/automation-results', controller.applyAutomationResult)
    router.put('/job-posts/:jobPostId/next-step', controller.saveNextStep)

    return router
}
