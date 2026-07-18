import type { WorkCapability, WorkTaskEvent } from '@job-search-facilitator/core'
import { WORK_CAPABILITIES } from '@job-search-facilitator/core'
import { ACCEPTED, BAD_REQUEST, NOT_FOUND, SERVER_ERROR } from '@job-search-facilitator/utils'
import cors from 'cors'
import express from 'express'
import { z } from 'zod'
import type { WorkTaskManager } from './task-manager.ts'

const startWorkTaskInputSchema = z.strictObject({
    prompt: z.string().trim().min(1),
    outputSchema: z.record(z.string(), z.unknown()),
    capabilities: z.array(z.enum(WORK_CAPABILITIES)).default([]),
})

const taskIdParamsSchema = z.strictObject({ id: z.uuid() })

const taskNotFound = { error: 'Work task not found' }

const sendEvent = (response: express.Response, event: WorkTaskEvent) => {
    response.write(`data: ${JSON.stringify(event)}\n\n`)
}

export const createApp = (
    taskManager: WorkTaskManager,
    capabilities: WorkCapability[],
    clientOrigin: string,
) => {
    const app = express()

    app.use(cors({ origin: clientOrigin }))
    app.use(express.json())

    app.get('/health', (_request, response) => {
        response.json({ status: 'healthy', capabilities })
    })

    app.post('/tasks', async (request, response) => {
        const input = startWorkTaskInputSchema.safeParse(request.body)

        if (!input.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        try {
            response.status(ACCEPTED).json(await taskManager.start(input.data))
        } catch (error) {
            response.status(SERVER_ERROR).json({
                error: error instanceof Error ? error.message : 'Could not start Work task',
            })
        }
    })

    app.get('/tasks/:id', (request, response) => {
        const params = taskIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        const task = taskManager.get(params.data.id)

        if (task === null) {
            response.status(NOT_FOUND).json(taskNotFound)
            return
        }

        response.json(task)
    })

    app.get('/tasks/:id/events', (request, response) => {
        const params = taskIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        if (taskManager.get(params.data.id) === null) {
            response.status(NOT_FOUND).json(taskNotFound)
            return
        }

        response.set({
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Content-Type': 'text/event-stream',
        })
        response.flushHeaders()

        let unsubscribe = () => {}
        const connection = taskManager.connect(params.data.id, (event) => {
            sendEvent(response, event)

            if (event.type === 'completed' || event.type === 'failed') {
                unsubscribe()
                response.end()
            }
        })

        if (connection === null) {
            response.end()
            return
        }

        unsubscribe = connection.unsubscribe

        for (const event of connection.events) {
            sendEvent(response, event)
        }

        if (connection.task.status !== 'running') {
            connection.unsubscribe()
            response.end()
            return
        }

        request.on('close', unsubscribe)
    })

    return app
}
