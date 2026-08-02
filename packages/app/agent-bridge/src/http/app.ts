import { SERVICE_UNAVAILABLE } from '@job-search-facilitator/utils'
import cors from 'cors'
import express from 'express'
import type { AgentTaskManager } from '../tasks/agent-task-manager.ts'
import { createTaskRouter } from './task-routes.ts'

export const createApp = (taskManager: AgentTaskManager, clientOrigin: string) => {
    const app = express()

    app.use(cors({ origin: clientOrigin }))
    app.use(express.json())

    app.get('/health', (_request, response) => {
        const health = taskManager.health

        if (health.status === 'unavailable') {
            response.status(SERVICE_UNAVAILABLE)
        }

        response.json(health)
    })

    app.use(createTaskRouter(taskManager))

    return app
}
