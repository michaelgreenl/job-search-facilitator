import express from 'express'
import type {
    OutreachContactRepository,
    OutreachRunRepository,
} from '../../db/repositories/outreach.repository.ts'
import {
    createOutreachContactController,
    createOutreachRunController,
} from '../controllers/outreach.controller.ts'

export const createOutreachContactRouter = (repository: OutreachContactRepository) => {
    const router = express.Router({ mergeParams: true })
    const controller = createOutreachContactController(repository)

    router.post('/', controller.create)
    router.get('/', controller.listByJobPost)
    router.patch('/:contactId', controller.updateById)

    return router
}

export const createOutreachRunRouter = (repository: OutreachRunRepository) => {
    const router = express.Router()
    const controller = createOutreachRunController(repository)

    router.post('/', controller.create)
    router.get('/:runId', controller.getById)
    router.patch('/:runId', controller.updateById)

    return router
}
