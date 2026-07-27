import express from 'express'
import type { OutreachContactRepository } from '../../db/repositories/outreach-contact.repository.ts'
import { createOutreachContactController } from '../controllers/outreach-contact.controller.ts'

export const createOutreachContactRouter = (repository: OutreachContactRepository) => {
    const router = express.Router({ mergeParams: true })
    const controller = createOutreachContactController(repository)

    router.post('/', controller.create)
    router.get('/', controller.listByJobPost)
    router.patch('/:contactId', controller.updateById)

    return router
}
