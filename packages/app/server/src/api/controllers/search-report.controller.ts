import type { Request, Response } from 'express'
import { BAD_REQUEST, CONFLICT, CREATED, NOT_FOUND, OK } from '@job-search-facilitator/core'
import type { SearchReportRepository } from '../../db/repositories/search-report.repository.ts'
import {
    reportIdParamsSchema,
    reportUpsertQuerySchema,
    reportUpsertParamsSchema,
    upsertJobSearchReportInputSchema,
} from '../schemas/search-report.schema.ts'

const invalidRequest = { error: 'Invalid request' }
const searchReportNotFound = { error: 'Job search report not found' }
const netNewConflict = (conflictingSourceKeys: string[]) => ({
    error: 'Job search report contains posts that are not net-new',
    conflictingSourceKeys,
})

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
        const query = reportUpsertQuerySchema.safeParse(request.query)
        const input = upsertJobSearchReportInputSchema.safeParse(request.body)

        if (!params.success || !query.success || !input.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const result =
            query.data.requireNetNew === 'true'
                ? await repository.upsertNetNewById(
                      params.data.reportId,
                      params.data.reportDate,
                      input.data,
                  )
                : await repository.upsertById(
                      params.data.reportId,
                      params.data.reportDate,
                      input.data,
                  )

        if ('conflict' in result) {
            response.status(CONFLICT).json(netNewConflict(result.conflictingSourceKeys))
            return
        }

        response.status(result.created ? CREATED : OK).json(result.report)
    },
})
