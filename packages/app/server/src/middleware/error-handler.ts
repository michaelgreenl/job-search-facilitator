import type { ApiResponse } from '@job-search-facilitator/core'
import { SERVER_ERROR } from '@job-search-facilitator/utils'
import type { ErrorRequestHandler } from 'express'

type ErrorWithStatus = Error & {
  status?: number
}

const hasStatus = (error: Error): error is ErrorWithStatus =>
  typeof (error as ErrorWithStatus).status === 'number'

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  let message = 'Internal Server Error'
  let status = SERVER_ERROR

  if (error instanceof Error) {
    console.error(error.stack ?? error.message)

    if (
      hasStatus(error) &&
      error.status !== undefined &&
      error.status >= 400 &&
      error.status < 600
    ) {
      status = error.status

      if (status < 500) {
        message = error.message
      }
    }
  } else {
    console.error('Unknown error', error)
  }

  const body: ApiResponse<never> = {
    success: false,
    message,
  }

  response.status(status).json(body)
}
