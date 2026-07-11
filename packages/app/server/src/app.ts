import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { apiRoutes } from './api/routes/index.ts'
import { env } from './config/env.ts'
import { errorHandler } from './middleware/error-handler.ts'
import { notFound } from './middleware/not-found.ts'

export const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: env.CLIENT_ORIGIN }))
app.use(express.json())
app.use(apiRoutes)
app.use(notFound)
app.use(errorHandler)
