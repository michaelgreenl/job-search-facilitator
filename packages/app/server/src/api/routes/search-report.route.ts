import express from 'express'
import type { SearchReportRepository } from '../../db/repositories/search-report.repository.ts'
import { createSearchReportController } from '../controllers/search-report.controller.ts'

export const createSearchReportRouter = (repository: SearchReportRepository) => {
    const router = express.Router()
    const controller = createSearchReportController(repository)

    router.get('/', controller.list)
    router.get('/:reportId', controller.getById)
    router.put('/:reportDate/:reportId', controller.upsertById)

    return router
}
