import express from 'express'
import type { JobUpdateCheckRepository } from '../../db/repositories/job-update-check.repository.ts'
import { createJobUpdateCheckController } from '../controllers/job-update-check.controller.ts'

export const createJobUpdateCheckRouter = (repository: JobUpdateCheckRepository) => {
    const router = express.Router()
    const controller = createJobUpdateCheckController(repository)

    router.get('/context', controller.context)
    router.post('/', controller.save)

    return router
}
