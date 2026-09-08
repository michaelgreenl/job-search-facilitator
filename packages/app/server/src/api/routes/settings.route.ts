import { MAX_APPLICATION_ARTIFACT_BYTES } from '@job-search-facilitator/core'
import express from 'express'
import type { SettingsRepository } from '../../settings/file-settings.repository.ts'
import { createSettingsController } from '../controllers/settings.controller.ts'

export const createSettingsRouter = (repository: SettingsRepository) => {
    const router = express.Router()
    const controller = createSettingsController(repository)

    router.get('/', controller.get)
    router.put('/', controller.save)
    router.post(
        '/resumes',
        express.raw({ limit: MAX_APPLICATION_ARTIFACT_BYTES, type: () => true }),
        controller.uploadResume,
    )
    router.get('/resumes/:id', controller.openResume)

    return router
}
