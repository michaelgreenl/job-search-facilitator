import type { Request, Response } from 'express'
import { BAD_REQUEST, CREATED, NOT_FOUND, OK } from '@job-search-facilitator/utils'
import type { SearchReportRepository } from '../../db/repositories/search-report.repository.ts'
import {
    reportIdParamsSchema,
    reportUpsertParamsSchema,
    upsertJobSearchReportInputSchema,
} from '../schemas/search-report.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const searchReportNotFound = { error: 'Job search report not found' }

export const createSearchReportController = (repository: SearchReportRepository) => ({
    list: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findMany())
    },

    getById: async (request: Request, response: Response): Promise<void> => {
        const params = reportIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const report = await repository.findById(params.data.reportId)

        if (report === null) {
            response.status(NOT_FOUND).json(searchReportNotFound)
            return
        }

        response.json(report)
    },

    upsertById: async (request: Request, response: Response): Promise<void> => {
        const params = reportUpsertParamsSchema.safeParse(request.params)
        const input = upsertJobSearchReportInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const result = await repository.upsertById(
            params.data.reportId,
            params.data.reportDate,
            input.data,
        )

        response.status(result.created ? CREATED : OK).json(result.report)
    },
})
