import type { HealthResponse } from '@job-search-facilitator/core'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { apiRouter } from './api/routes/index.ts'
import { env } from './config/env.ts'

export const app = express()

app.use(helmet())
app.use(cors({ origin: env.CLIENT_ORIGIN }))
app.use(express.json({ limit: '1mb' }))

app.use('/api', apiRouter)

app.get('/health', (_request, response) => {
    response.json({ status: 'healthy' } satisfies HealthResponse)
})
