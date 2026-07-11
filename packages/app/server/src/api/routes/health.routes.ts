import { Router } from 'express'
import { checkHealth } from '../controllers/health.controller.ts'

export const healthRoutes = Router()

healthRoutes.get('/', checkHealth)
