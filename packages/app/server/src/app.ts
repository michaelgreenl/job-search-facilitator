import { MAX_JSON_REQUEST_BYTES, type HealthResponse } from '@job-search-facilitator/core'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { apiRouter } from './api/routes/index.ts'
import { env } from './config/env.ts'

export const app = express()

app.use(helmet())
app.use(cors({ origin: env.CLIENT_ORIGIN }))
app.use(express.json({ limit: MAX_JSON_REQUEST_BYTES }))

app.use('/api', apiRouter)

app.get('/health', (_request, response) => {
    response.json({
        status: 'healthy',
        capabilities: { jobSearchNetNewGuard: 1 },
    } satisfies HealthResponse)
})
