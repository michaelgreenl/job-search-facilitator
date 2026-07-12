import type { Request, Response } from 'express'
import type { SearchReportRepository } from '../../db/repositories/search-report.repository.ts'
import {
    reportDateParamsSchema,
    upsertJobSearchReportInputSchema,
} from '../schemas/search-report.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const searchReportNotFound = { error: 'Job search report not found' }

export const createSearchReportController = (repository: SearchReportRepository) => ({
    list: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.findMany())
    },

    getByDate: async (request: Request, response: Response): Promise<void> => {
        const params = reportDateParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(400).json(invalidRequest)
            return
        }

        const report = await repository.findByDate(params.data.reportDate)

        if (report === null) {
            response.status(404).json(searchReportNotFound)
            return
        }

        response.json(report)
    },

    upsertByDate: async (request: Request, response: Response): Promise<void> => {
        const params = reportDateParamsSchema.safeParse(request.params)
        const input = upsertJobSearchReportInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(400).json(invalidRequest)
            return
        }

        const result = await repository.upsertByDate(params.data.reportDate, input.data)

        response.status(result.created ? 201 : 200).json(result.report)
    },
})
