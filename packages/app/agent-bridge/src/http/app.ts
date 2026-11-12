import { SERVICE_UNAVAILABLE } from '@job-search-facilitator/core'
import cors from 'cors'
import express from 'express'
import type { ProviderRouter } from '../runtime/provider-router.ts'
import type { AgentSettingsStore } from '../settings/agent-settings.ts'
import type { AgentTaskManager } from '../tasks/agent-task-manager.ts'
import { createTaskRouter } from './task-routes.ts'
import { createAutomationRouter } from './automation-routes.ts'
import { createSettingsRouter } from './settings-routes.ts'

export const createApp = (
    taskManager: AgentTaskManager,
    clientOrigin: string,
    automations?: { directory: string; projectRoot: string },
    settings?: { store: AgentSettingsStore; providers: ProviderRouter },
) => {
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
    if (automations)
        app.use(
            createAutomationRouter(automations.directory, automations.projectRoot, clientOrigin),
        )
    if (settings) app.use(createSettingsRouter(settings.store, settings.providers, clientOrigin))

    return app
}
