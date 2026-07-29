import { randomUUID } from 'node:crypto'
import type {
    JsonObject,
    StartAgentTaskInput,
    AgentPermissionDecision,
    AgentPermissionRequired,
    AgentTask,
    AgentTaskEvent,
} from '@job-search-facilitator/core'
import { Ajv, type ValidateFunction } from 'ajv'
import type { AgentRuntime, AgentRuntimeAction, AgentRuntimeEvent } from './app-server.ts'

interface StoredTask {
    id: string
    status: AgentTask['status']
    threadId: string
    turnId: string
    output: JsonObject | null
    error: string | null
    capabilities: StartAgentTaskInput['capabilities']
    cancellation: Promise<void> | null
    events: AgentTaskStreamEvent[]
    listeners: Set<(event: AgentTaskStreamEvent) => void>
    finalMessages: string[]
    outputValidator: ValidateFunction<JsonObject>
    pendingAction: AgentPermissionRequired | null
    reasoningSection: { itemId: string; summaryIndex: number } | null
}

export interface AgentTaskConnection {
    task: AgentTask
    events: AgentTaskStreamEvent[]
    unsubscribe: () => void
}

export interface AgentTaskStreamEvent {
    id: number
    event: AgentTaskEvent
}

const isStructuredOutput = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const containsDialectMarker = (value: unknown): boolean =>
    Array.isArray(value)
        ? value.some(containsDialectMarker)
        : isStructuredOutput(value) &&
          ('$schema' in value || Object.values(value).some(containsDialectMarker))

const outputSchemaValidator = new Ajv({ addUsedSchema: false, strict: true })

export class InvalidAgentOutputSchemaError extends Error {
    constructor() {
        super('Invalid Agent output schema')
        this.name = 'InvalidAgentOutputSchemaError'
    }
}

const compileOutputValidator = (schema: unknown): ValidateFunction<JsonObject> => {
    if (
        !isStructuredOutput(schema) ||
        schema.type !== 'object' ||
        schema.$async === true ||
        containsDialectMarker(schema)
    ) {
        throw new InvalidAgentOutputSchemaError()
    }

    try {
        const validator = outputSchemaValidator.compile<JsonObject>(schema)

        if ('$async' in validator) {
            throw new InvalidAgentOutputSchemaError()
        }

        return validator
    } catch {
        throw new InvalidAgentOutputSchemaError()
    }
}

const publicTask = (task: StoredTask): AgentTask => {
    const identity = {
        id: task.id,
        threadId: task.threadId,
        turnId: task.turnId,
    }

    if (task.status === 'completed' && task.output !== null && task.error === null) {
        return { ...identity, status: 'completed', output: task.output, error: null }
    }

    if (task.status === 'failed' && task.output === null && task.error !== null) {
        return { ...identity, status: 'failed', output: null, error: task.error }
    }

    if (
        (task.status === 'running' || task.status === 'cancelled') &&
        task.output === null &&
        task.error === null
    ) {
        return { ...identity, status: task.status, output: null, error: null }
    }

    throw new Error('Agent task state is inconsistent')
}

export class AgentTaskManager {
    private readonly tasks = new Map<string, StoredTask>()
    private readonly taskStarts = new Map<string, Promise<AgentTask>>()

    constructor(private readonly runtime: AgentRuntime) {
        runtime.onEvent((event) => this.handleEvent(event))
    }

    async start(input: StartAgentTaskInput, id: string = randomUUID()): Promise<AgentTask> {
        const existingTask = this.tasks.get(id)

        if (existingTask !== undefined) {
            return publicTask(existingTask)
        }

        const existingStart = this.taskStarts.get(id)

        if (existingStart !== undefined) {
            return existingStart
        }

        const taskStart = this.startNewTask(id, input)
        this.taskStarts.set(id, taskStart)

        try {
            return await taskStart
        } finally {
            if (this.taskStarts.get(id) === taskStart) {
                this.taskStarts.delete(id)
            }
        }
    }

    private async startNewTask(id: string, input: StartAgentTaskInput): Promise<AgentTask> {
        const outputValidator = compileOutputValidator(input.outputSchema)
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
            outputValidator,
            pendingAction: null,
            reasoningSection: null,
        }

        this.tasks.set(id, task)
        this.emit(task, {
            type: 'activity',
            message: 'Task started',
            createdAt: new Date().toISOString(),
        })

        return publicTask(task)
    }

    get(id: string): AgentTask | null {
        const task = this.tasks.get(id)

        return task === undefined ? null : publicTask(task)
    }

    async cancel(id: string): Promise<{ accepted: boolean; task: AgentTask } | null> {
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

    resolveAction(id: string, actionId: string, decision: AgentPermissionDecision): boolean {
        const task = this.tasks.get(id)

        if (task?.pendingAction?.id !== actionId) {
            return false
        }

        return this.runtime.resolveAction(actionId, decision)
    }

    connect(
        id: string,
        listener: (event: AgentTaskStreamEvent) => void,
        afterEventId = 0,
    ): AgentTaskConnection | null {
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

    private handleEvent(event: AgentRuntimeEvent): void {
        if (event.type === 'runtime-failed') {
            for (const task of this.tasks.values()) {
                if (task.status === 'running') {
                    this.fail(task, event.error.message)
                }
            }

            return
        }

        if (event.type === 'action-required') {
            this.handleActionRequired(event.action)
            return
        }

        if (event.type === 'action-resolved') {
            const task = [...this.tasks.values()].find(
                (candidate) =>
                    candidate.threadId === event.threadId &&
                    candidate.pendingAction?.id === event.actionId,
            )

            if (task !== undefined) {
                task.pendingAction = null
                this.emit(task, {
                    type: 'action-resolved',
                    actionId: event.actionId,
                    createdAt: new Date().toISOString(),
                })
            }

            return
        }

        const task = [...this.tasks.values()].find(
            (candidate) =>
                candidate.threadId === event.threadId && candidate.turnId === event.turnId,
        )

        if (task === undefined || task.status !== 'running') {
            return
        }

        if (event.type === 'activity') {
            const message = {
                'web-search': 'Searching the web',
                'tool-use': task.capabilities.includes('chrome') ? 'Using Chrome' : 'Using a tool',
                'local-read': 'Reading local context',
                delegation: 'Delegating part of the task',
                'plan-update': 'Plan updated',
            }[event.activity]
            this.activity(task, message)
        } else if (event.type === 'reasoning-delta') {
            const startsNewStatement =
                task.reasoningSection === null ||
                task.reasoningSection.itemId !== event.itemId ||
                task.reasoningSection.summaryIndex !== event.summaryIndex

            task.reasoningSection = {
                itemId: event.itemId,
                summaryIndex: event.summaryIndex,
            }

            this.emit(task, {
                type: 'message',
                textDelta: event.textDelta,
                startsNewStatement,
                createdAt: new Date().toISOString(),
            })
        } else if (event.type === 'final-message') {
            task.finalMessages.push(event.text)
        } else if (event.type === 'turn-completed') {
            this.completeTurn(task, event.status, event.error)
        }
    }

    private handleActionRequired({ threadId, turnId, ...action }: AgentRuntimeAction): void {
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

    private completeTurn(
        task: StoredTask,
        status: Extract<AgentRuntimeEvent, { type: 'turn-completed' }>['status'],
        error: string | null,
    ): void {
        if (status === 'interrupted') {
            this.markCancelled(task)
            return
        }

        if (status !== 'completed') {
            this.fail(task, error ?? 'Agent task did not complete')
            return
        }

        const finalMessage = task.finalMessages.at(-1)

        if (finalMessage === undefined) {
            this.fail(task, 'Agent task returned no final result')
            return
        }

        let output: unknown

        try {
            output = JSON.parse(finalMessage)
        } catch {
            this.fail(task, 'Agent task returned invalid structured output')
            return
        }

        if (!isStructuredOutput(output)) {
            this.fail(task, 'Agent task returned invalid structured output')
            return
        }

        if (!task.outputValidator(output)) {
            this.fail(task, 'Agent task returned output that did not match its schema')
            return
        }

        task.status = 'completed'
        task.output = output
        task.pendingAction = null
        this.emit(task, { type: 'completed', output, createdAt: new Date().toISOString() })
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

    private emit(task: StoredTask, event: AgentTaskEvent): void {
        const streamEvent = { id: (task.events.at(-1)?.id ?? 0) + 1, event }
        task.events.push(streamEvent)

        for (const listener of task.listeners) {
            listener(streamEvent)
        }
    }
}
