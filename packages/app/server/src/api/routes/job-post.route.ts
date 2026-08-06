import { MAX_APPLICATION_ARTIFACT_BYTES } from '@job-search-facilitator/core'
import express from 'express'
import { createApplicationArtifactController } from '../controllers/application-artifact.controller.ts'
import { createJobPostController } from '../controllers/job-post.controller.ts'
import type { ApplicationArtifactRepository } from '../../db/repositories/application-artifact.repository.ts'
import type { JobPostRepository } from '../../db/repositories/job-post.repository.ts'

export const createJobPostRouter = (
    repository: JobPostRepository,
    applicationArtifactRepository: ApplicationArtifactRepository,
) => {
    const router = express.Router()
    const controller = createJobPostController(repository)
    const applicationArtifactController = createApplicationArtifactController(
        applicationArtifactRepository,
    )

    router.get('/', controller.list)
    router.post('/', controller.createUserAdded)
    router.get('/apply-queue', controller.listApplyQueue)
    router.get('/tracked', controller.listTracked)
    router.get('/user-added', controller.listUserAdded)
    router.put(
        '/:id/artifacts/:kind',
        express.raw({ limit: MAX_APPLICATION_ARTIFACT_BYTES, type: () => true }),
        applicationArtifactController.save,
    )
    router.get('/:id/artifacts/:kind', applicationArtifactController.open)
    router.delete('/:id/artifacts/:kind', applicationArtifactController.remove)
    router.get('/:id', controller.getById)
    router.patch('/:id', controller.updateById)

    return router
}
