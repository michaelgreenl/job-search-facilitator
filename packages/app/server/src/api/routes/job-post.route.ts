import express from 'express'
import { createApplicationCaptureController } from '../controllers/application-capture.controller.ts'
import { createJobPostController } from '../controllers/job-post.controller.ts'
import type { ApplicationCaptureRepository } from '../../db/repositories/application-capture.repository.ts'
import type { JobPostRepository } from '../../db/repositories/job-post.repository.ts'

export const createJobPostRouter = (
    repository: JobPostRepository,
    applicationCaptureRepository: ApplicationCaptureRepository,
) => {
    const router = express.Router()
    const controller = createJobPostController(repository)
    const applicationCaptureController = createApplicationCaptureController(
        applicationCaptureRepository,
    )

    router.get('/', controller.list)
    router.post('/', controller.createUserAdded)
    router.get('/apply-queue', controller.listApplyQueue)
    router.get('/tracked', controller.listTracked)
    router.get('/user-added', controller.listUserAdded)
    router.put('/:id/application-capture', applicationCaptureController.save)
    router.get('/:id', controller.getById)
    router.patch('/:id', controller.updateById)

    return router
}
