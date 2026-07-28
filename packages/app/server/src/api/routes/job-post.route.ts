import express from 'express'
import { createJobPostController } from '../controllers/job-post.controller.ts'
import type { JobPostRepository } from '../../db/repositories/job-post.repository.ts'

export const createJobPostRouter = (repository: JobPostRepository) => {
    const router = express.Router()
    const controller = createJobPostController(repository)

    router.get('/', controller.list)
    router.post('/', controller.createUserAdded)
    router.get('/apply-queue', controller.listApplyQueue)
    router.get('/user-added', controller.listUserAdded)
    router.get('/:id', controller.getById)
    router.patch('/:id', controller.updateById)

    return router
}
