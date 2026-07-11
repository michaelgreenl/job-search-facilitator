import { Router } from 'express'
import { healthRoutes } from './health.routes.ts'

export const apiRoutes = Router()

apiRoutes.use('/health', healthRoutes)
