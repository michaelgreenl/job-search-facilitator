import { AGENT_CAPABILITIES } from '@job-search-facilitator/core'
import {
    ACCEPTED,
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    SERVER_ERROR,
    SERVICE_UNAVAILABLE,
} from '@job-search-facilitator/utils'
import express from 'express'
import { z } from 'zod'
import type { AgentTaskManager, AgentTaskStreamEvent } from '../tasks/agent-task-manager.ts'
import { InvalidAgentOutputSchemaError } from '../tasks/output-schema.ts'

const startAgentTaskInputSchema = z.strictObject({
    prompt: z.string().trim().min(1),
    outputSchema: z.looseObject({
        type: z.literal('object'),
        $async: z.literal(false).optional(),
    }),
    capabilities: z.array(z.enum(AGENT_CAPABILITIES)).default([]),
})

const taskIdParamsSchema = z.strictObject({ id: z.uuid() })
const taskPermissionParamsSchema = z.strictObject({ id: z.uuid(), permissionId: z.uuid() })
const taskPermissionInputSchema = z.strictObject({ decision: z.enum(['approve', 'decline']) })

const taskNotFound = { error: 'Agent task not found' }

const sendEvent = (response: express.Response, { id, event }: AgentTaskStreamEvent) => {
    response.write(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`)
}

export const createTaskRouter = (taskManager: AgentTaskManager) => {
    const router = express.Router()

    const startTask = async (
        request: express.Request,
        response: express.Response,
        taskId?: string,
    ) => {
        const input = startAgentTaskInputSchema.safeParse(request.body)

        if (!input.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        if (taskId !== undefined) {
            const existingTask = taskManager.get(taskId)

            if (existingTask !== null) {
                response.status(ACCEPTED).json(existingTask)
                return
            }
        }

        const health = taskManager.health

        if (health.status === 'unavailable') {
            response.status(SERVICE_UNAVAILABLE).json({ error: health.error })
            return
        }

        try {
            response.status(ACCEPTED).json(await taskManager.start(input.data, taskId))
        } catch (error) {
            if (error instanceof InvalidAgentOutputSchemaError) {
                response.status(BAD_REQUEST).json({ error: 'Invalid request' })
                return
            }

            const currentHealth = taskManager.health

            if (currentHealth.status === 'unavailable') {
                response.status(SERVICE_UNAVAILABLE).json({ error: currentHealth.error })
                return
            }

            response.status(SERVER_ERROR).json({
                error: error instanceof Error ? error.message : 'Could not start Agent task',
            })
        }
    }

    router.post('/tasks', async (request, response) => {
        await startTask(request, response)
    })

    router.put('/tasks/:id', async (request, response) => {
        const params = taskIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        await startTask(request, response, params.data.id)
    })

    router.get('/tasks/:id', (request, response) => {
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

    router.post('/tasks/:id/cancel', async (request, response) => {
        const params = taskIdParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        try {
            const result = await taskManager.cancel(params.data.id)

            if (result === null) {
                response.status(NOT_FOUND).json(taskNotFound)
                return
            }

            if (!result.accepted) {
                response.status(CONFLICT).json({ error: 'Agent task is not running' })
                return
            }

            response.status(ACCEPTED).json(result.task)
        } catch (error) {
            response.status(SERVER_ERROR).json({
                error: error instanceof Error ? error.message : 'Could not cancel Agent task',
            })
        }
    })

    router.post('/tasks/:id/permissions/:permissionId', (request, response) => {
        const params = taskPermissionParamsSchema.safeParse(request.params)
        const input = taskPermissionInputSchema.safeParse(request.body)

        if (!params.success || !input.success) {
            response.status(BAD_REQUEST).json({ error: 'Invalid request' })
            return
        }

        if (
            !taskManager.resolvePermission(
                params.data.id,
                params.data.permissionId,
                input.data.decision,
            )
        ) {
            response.status(NOT_FOUND).json({ error: 'Agent permission not found' })
            return
        }

        response.status(ACCEPTED).json({ status: 'accepted' })
    })

    router.get('/tasks/:id/events', (request, response) => {
        const params = taskIdParamsSchema.safeParse(request.params)
        const lastEventId = Number(request.get('Last-Event-ID') ?? 0)

        if (!params.success || !Number.isSafeInteger(lastEventId) || lastEventId < 0) {
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
        const connection = taskManager.connect(
            params.data.id,
            (streamEvent) => {
                sendEvent(response, streamEvent)

                if (
                    streamEvent.event.type === 'completed' ||
                    streamEvent.event.type === 'failed' ||
                    streamEvent.event.type === 'cancelled'
                ) {
                    unsubscribe()
                    response.end()
                }
            },
            lastEventId,
        )

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

    return router
}
