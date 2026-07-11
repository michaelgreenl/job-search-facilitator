import type { RequestHandler } from 'express'
import type { HealthData, HealthResponse } from '@job-search-facilitator/core'
import { OK } from '@job-search-facilitator/utils'

export const checkHealth: RequestHandler = (_request, response) => {
  const data: HealthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }
  const body: HealthResponse = {
    success: true,
    data,
  }

  response.status(OK).json(body)
}
