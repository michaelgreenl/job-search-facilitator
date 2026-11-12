import {
    agentSettingsSchema,
    AGENT_PROVIDERS,
    type AgentSettingsState,
} from '@job-search-facilitator/core'
import express from 'express'
import type { ProviderRouter } from '../runtime/provider-router.ts'
import type { AgentSettingsStore } from '../settings/agent-settings.ts'

export const createSettingsRouter = (
    store: AgentSettingsStore,
    providers: ProviderRouter,
    clientOrigin: string,
) => {
    const router = express.Router()

    router.get('/settings', async (_request, response) => {
        const state: AgentSettingsState = {
            settings: store.current,
            providers: await providers.status(),
        }
        response.set('Cache-Control', 'no-store').json(state)
    })

    router.put('/settings', async (request, response) => {
        if (request.get('Origin') !== clientOrigin || !request.is('application/json')) {
            response.status(403).json({ error: 'Agent settings must come from this application.' })
            return
        }
        const input = agentSettingsSchema.safeParse(request.body)
        const available = await providers.status()
        // An unavailable provider lists no models, so its saved choice is kept as sent.
        const supported =
            input.success &&
            AGENT_PROVIDERS.every((id) => {
                const models = available.find((provider) => provider.id === id)?.models ?? []
                const { model, reasoningEffort } = input.data.models[id]
                return (
                    models.length === 0 ||
                    models
                        .find((candidate) => candidate.id === model)
                        ?.reasoningEfforts.includes(reasoningEffort) === true
                )
            })
        if (!input.success || !supported) {
            response.status(400).json({ error: 'Choose an available model and reasoning effort.' })
            return
        }
        try {
            store.save(input.data)
        } catch {
            response.status(503).json({ error: 'Could not save the Agent settings. Try again.' })
            return
        }
        const state: AgentSettingsState = { settings: store.current, providers: available }
        response.json(state)
    })

    return router
}
