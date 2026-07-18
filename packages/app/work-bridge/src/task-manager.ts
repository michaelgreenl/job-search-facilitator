import { randomUUID } from 'node:crypto'
import type {
    JsonObject,
    StartWorkTaskInput,
    WorkTask,
    WorkTaskEvent,
} from '@job-search-facilitator/core'
import type { AppServerNotification, WorkRuntime } from './app-server.ts'

interface StoredTask extends WorkTask {
    capabilities: StartWorkTaskInput['capabilities']
    events: WorkTaskEvent[]
    listeners: Set<(event: WorkTaskEvent) => void>
    messagePhases: Map<string, string | null>
    finalMessages: string[]
}

export interface WorkTaskConnection {
    task: WorkTask
    events: WorkTaskEvent[]
    unsubscribe: () => void
}

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const publicTask = ({
    capabilities: _capabilities,
    events: _events,
    listeners: _listeners,
    messagePhases: _messagePhases,
    finalMessages: _finalMessages,
    ...task
}: StoredTask): WorkTask => task

export class WorkTaskManager {
    private readonly tasks = new Map<string, StoredTask>()

    constructor(private readonly runtime: WorkRuntime) {
        runtime.onNotification((notification) => this.handleNotification(notification))
        runtime.onExit((error) => {
            for (const task of this.tasks.values()) {
                if (task.status === 'running') {
                    this.fail(task, error.message)
                }
            }
        })
    }

    async start(input: StartWorkTaskInput): Promise<WorkTask> {
        const id = randomUUID()
        const { threadId, turnId } = await this.runtime.startTask(id, input)
        const task: StoredTask = {
            id,
            status: 'running',
            threadId,
            turnId,
            output: null,
            error: null,
            capabilities: input.capabilities,
            events: [],
            listeners: new Set(),
            messagePhases: new Map(),
            finalMessages: [],
        }

        this.tasks.set(id, task)
        this.emit(task, {
            type: 'activity',
            message: 'Task started',
            createdAt: new Date().toISOString(),
        })

        return publicTask(task)
    }

    get(id: string): WorkTask | null {
        const task = this.tasks.get(id)

        return task === undefined ? null : publicTask(task)
    }

    connect(id: string, listener: (event: WorkTaskEvent) => void): WorkTaskConnection | null {
        const task = this.tasks.get(id)

        if (task === undefined) {
            return null
        }

        task.listeners.add(listener)

        return {
            task: publicTask(task),
            events: [...task.events],
            unsubscribe: () => task.listeners.delete(listener),
        }
    }

    private handleNotification({ method, params }: AppServerNotification): void {
        const threadId = stringValue(params.threadId)
        const turnId =
            stringValue(params.turnId) ?? stringValue((params.turn as JsonObject | undefined)?.id)

        if (threadId === null || turnId === null) {
            return
        }

        const task = [...this.tasks.values()].find(
            (candidate) => candidate.threadId === threadId && candidate.turnId === turnId,
        )

        if (task === undefined || task.status !== 'running') {
            return
        }

        if (method === 'item/started') {
            this.handleItemStarted(task, params.item)
        } else if (method === 'item/agentMessage/delta') {
            const itemId = stringValue(params.itemId)
            const delta = stringValue(params.delta)

            if (
                itemId !== null &&
                delta !== null &&
                task.messagePhases.get(itemId) === 'commentary'
            ) {
                this.emit(task, {
                    type: 'message',
                    textDelta: delta,
                    createdAt: new Date().toISOString(),
                })
            }
        } else if (method === 'item/completed') {
            this.handleItemCompleted(task, params.item)
        } else if (method === 'turn/plan/updated') {
            this.activity(task, 'Plan updated')
        } else if (method === 'turn/completed') {
            this.completeTurn(task, params.turn)
        }
    }

    private handleItemStarted(task: StoredTask, value: unknown): void {
        if (!isObject(value)) {
            return
        }

        const type = stringValue(value.type)
        const itemId = stringValue(value.id)

        if (type === 'agentMessage' && itemId !== null) {
            task.messagePhases.set(itemId, stringValue(value.phase))
        } else if (type === 'webSearch') {
            this.activity(task, 'Searching the web')
        } else if (type === 'mcpToolCall') {
            this.activity(
                task,
                task.capabilities.includes('chrome') ? 'Using Chrome' : 'Using a tool',
            )
        } else if (type === 'commandExecution') {
            this.activity(task, 'Reading local context')
        } else if (type === 'collabAgentToolCall') {
            this.activity(task, 'Delegating part of the task')
        }
    }

    private handleItemCompleted(task: StoredTask, value: unknown): void {
        if (!isObject(value) || value.type !== 'agentMessage') {
            return
        }

        const text = stringValue(value.text)
        const phase = stringValue(value.phase)

        if (text !== null && (phase === 'final_answer' || phase === null)) {
            task.finalMessages.push(text)
        }
    }

    private completeTurn(task: StoredTask, value: unknown): void {
        if (!isObject(value)) {
            this.fail(task, 'Work task ended without a result')
            return
        }

        if (value.status !== 'completed') {
            const turnError = isObject(value.error) ? stringValue(value.error.message) : null
            this.fail(task, turnError ?? 'Work task did not complete')
            return
        }

        const finalMessage = task.finalMessages.at(-1)

        if (finalMessage === undefined) {
            this.fail(task, 'Work task returned no final result')
            return
        }

        try {
            const output: unknown = JSON.parse(finalMessage)

            if (!isObject(output)) {
                throw new Error()
            }

            task.status = 'completed'
            task.output = output
            this.emit(task, { type: 'completed', output, createdAt: new Date().toISOString() })
        } catch {
            this.fail(task, 'Work task returned invalid structured output')
        }
    }

    private activity(task: StoredTask, message: string): void {
        this.emit(task, { type: 'activity', message, createdAt: new Date().toISOString() })
    }

    private fail(task: StoredTask, error: string): void {
        task.status = 'failed'
        task.error = error
        this.emit(task, { type: 'failed', error, createdAt: new Date().toISOString() })
    }

    private emit(task: StoredTask, event: WorkTaskEvent): void {
        task.events.push(event)

        for (const listener of task.listeners) {
            listener(event)
        }
    }
}
