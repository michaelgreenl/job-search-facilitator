import { randomUUID } from 'node:crypto'
import type {
    JsonObject,
    StartWorkTaskInput,
    WorkActionDecision,
    WorkActionRequired,
    WorkTask,
    WorkTaskEvent,
} from '@job-search-facilitator/core'
import type { AppServerNotification, WorkRuntime, WorkRuntimeAction } from './app-server.ts'

interface StoredTask extends WorkTask {
    capabilities: StartWorkTaskInput['capabilities']
    cancellation: Promise<void> | null
    events: WorkTaskStreamEvent[]
    listeners: Set<(event: WorkTaskStreamEvent) => void>
    finalMessages: string[]
    pendingAction: WorkActionRequired | null
}

export interface WorkTaskConnection {
    task: WorkTask
    events: WorkTaskStreamEvent[]
    unsubscribe: () => void
}

export interface WorkTaskStreamEvent {
    id: number
    event: WorkTaskEvent
}

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const publicTask = ({
    capabilities: _capabilities,
    cancellation: _cancellation,
    events: _events,
    listeners: _listeners,
    finalMessages: _finalMessages,
    pendingAction: _pendingAction,
    ...task
}: StoredTask): WorkTask => task

export class WorkTaskManager {
    private readonly tasks = new Map<string, StoredTask>()

    constructor(private readonly runtime: WorkRuntime) {
        runtime.onActionRequired((action) => this.handleActionRequired(action))
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
            cancellation: null,
            events: [],
            listeners: new Set(),
            finalMessages: [],
            pendingAction: null,
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

    async cancel(id: string): Promise<{ accepted: boolean; task: WorkTask } | null> {
        const task = this.tasks.get(id)

        if (task === undefined) {
            return null
        }

        if (task.status !== 'running') {
            return { accepted: false, task: publicTask(task) }
        }

        const cancellation = task.cancellation ?? this.interrupt(task)
        task.cancellation = cancellation

        try {
            await cancellation
        } catch (error) {
            if (task.status === 'running') {
                throw error
            }
        } finally {
            if (task.cancellation === cancellation) {
                task.cancellation = null
            }
        }

        return { accepted: true, task: publicTask(task) }
    }

    resolveAction(id: string, actionId: string, decision: WorkActionDecision): boolean {
        const task = this.tasks.get(id)

        if (task?.pendingAction?.id !== actionId) {
            return false
        }

        return this.runtime.resolveAction(actionId, decision)
    }

    connect(
        id: string,
        listener: (event: WorkTaskStreamEvent) => void,
        afterEventId = 0,
    ): WorkTaskConnection | null {
        const task = this.tasks.get(id)

        if (task === undefined) {
            return null
        }

        task.listeners.add(listener)

        return {
            task: publicTask(task),
            events: task.events.filter(({ id: eventId }) => eventId > afterEventId),
            unsubscribe: () => task.listeners.delete(listener),
        }
    }

    private handleNotification({ method, params }: AppServerNotification): void {
        const threadId = stringValue(params.threadId)

        if (method === 'serverRequest/resolved') {
            const actionId = stringValue(params.actionId)
            const task = [...this.tasks.values()].find(
                (candidate) =>
                    candidate.threadId === threadId && candidate.pendingAction?.id === actionId,
            )

            if (task !== undefined && actionId !== null) {
                task.pendingAction = null
                this.emit(task, {
                    type: 'action-resolved',
                    actionId,
                    createdAt: new Date().toISOString(),
                })
            }

            return
        }

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
        } else if (method === 'item/reasoning/summaryTextDelta') {
            const delta = stringValue(params.delta)

            if (delta !== null) {
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

    private handleActionRequired({ threadId, turnId, ...action }: WorkRuntimeAction): void {
        const task = [...this.tasks.values()].find(
            (candidate) =>
                candidate.threadId === threadId &&
                (turnId === null || candidate.turnId === turnId) &&
                candidate.status === 'running',
        )

        if (task === undefined || task.pendingAction !== null) {
            this.runtime.resolveAction(action.id, 'decline')
            return
        }

        task.pendingAction = action
        this.emit(task, {
            type: 'action-required',
            action,
            createdAt: new Date().toISOString(),
        })
    }

    private handleItemStarted(task: StoredTask, value: unknown): void {
        if (!isObject(value)) {
            return
        }

        const type = stringValue(value.type)

        if (type === 'webSearch') {
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

        if (value.status === 'interrupted') {
            this.markCancelled(task)
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
            task.pendingAction = null
            this.emit(task, { type: 'completed', output, createdAt: new Date().toISOString() })
        } catch {
            this.fail(task, 'Work task returned invalid structured output')
        }
    }

    private activity(task: StoredTask, message: string): void {
        this.emit(task, { type: 'activity', message, createdAt: new Date().toISOString() })
    }

    private async interrupt(task: StoredTask): Promise<void> {
        await this.runtime.interruptTask(task.threadId, task.turnId)

        if (task.status === 'running') {
            this.markCancelled(task)
        }
    }

    private markCancelled(task: StoredTask): void {
        task.status = 'cancelled'
        task.pendingAction = null
        this.emit(task, { type: 'cancelled', createdAt: new Date().toISOString() })
    }

    private fail(task: StoredTask, error: string): void {
        task.status = 'failed'
        task.error = error
        task.pendingAction = null
        this.emit(task, { type: 'failed', error, createdAt: new Date().toISOString() })
    }

    private emit(task: StoredTask, event: WorkTaskEvent): void {
        const streamEvent = { id: (task.events.at(-1)?.id ?? 0) + 1, event }
        task.events.push(streamEvent)

        for (const listener of task.listeners) {
            listener(streamEvent)
        }
    }
}
