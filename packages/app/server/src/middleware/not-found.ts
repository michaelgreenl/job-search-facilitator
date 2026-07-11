import type { ApiResponse } from '@job-search-facilitator/core'
import { NOT_FOUND } from '@job-search-facilitator/utils'
import type { RequestHandler } from 'express'

export const notFound: RequestHandler = (request, response) => {
  const body: ApiResponse<never> = {
    success: false,
    message: `Route ${request.method} ${request.path} was not found`,
  }

  response.status(NOT_FOUND).json(body)
}
