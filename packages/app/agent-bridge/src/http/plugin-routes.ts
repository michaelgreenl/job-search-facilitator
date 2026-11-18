import { updateAgentPluginSchema } from '@job-search-facilitator/core'
import express from 'express'
import type { AgentPlugins } from '../plugins/agent-plugins.ts'

export const createPluginRouter = (plugins: AgentPlugins, clientOrigin: string) => {
    const router = express.Router()
    const fromApplication = (request: express.Request, response: express.Response) => {
        if (request.get('Origin') === clientOrigin) return true
        response.status(403).json({ error: 'Plugin changes must come from this application.' })
        return false
    }

    router.get('/plugins', async (_request, response) => {
        response.set('Cache-Control', 'no-store').json(await plugins.list())
    })

    router.post('/plugins/refresh', async (request, response) => {
        if (!fromApplication(request, response)) return
        response.json(await plugins.refresh())
    })

    router.put('/plugins/:id', async (request, response) => {
        if (!fromApplication(request, response)) return
        const input = updateAgentPluginSchema.safeParse(request.body)
        if (!input.success) {
            response.status(400).json({ error: 'Turn the plugin on or off.' })
            return
        }
        try {
            if (!plugins.setEnabled(request.params.id, input.data.enabled)) {
                response.status(404).json({ error: 'This plugin is not available.' })
                return
            }
        } catch {
            response.status(503).json({ error: 'Could not save the plugin setting. Try again.' })
            return
        }
        response.json((await plugins.list()).find(({ id }) => id === request.params.id))
    })

    return router
}
