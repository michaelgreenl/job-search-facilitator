import express from 'express'
import type { OutreachRunRepository } from '../../db/repositories/outreach-run.repository.ts'
import { createOutreachRunController } from '../controllers/outreach-run.controller.ts'

export const createOutreachRunRouter = (repository: OutreachRunRepository) => {
    const router = express.Router()
    const controller = createOutreachRunController(repository)

    router.post('/', controller.create)
    router.get('/:runId', controller.getById)
    router.patch('/:runId', controller.updateById)

    return router
}
