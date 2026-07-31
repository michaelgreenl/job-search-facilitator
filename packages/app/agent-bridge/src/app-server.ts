import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { createInterface, type Interface } from 'node:readline'
import type {
    JsonObject,
    StartAgentTaskInput,
    AgentPermissionDecision,
    AgentPermissionRequired,
    AgentCapability,
} from '@job-search-facilitator/core'
import { z } from 'zod'

type RpcId = number | string

interface OutgoingRpcMessage {
    id?: RpcId
    method?: string
    params?: unknown
    result?: unknown
    error?: { code: number; message: string }
}

interface PendingRequest {
    method: string
    resolveResult: (value: unknown) => boolean
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
}

interface PendingPermission {
    requestId: RpcId
    permission: AgentRuntimePermission
    decision: AgentPermissionDecision | null
}

type SpawnProcess = (
    command: string,
    args: string[],
    options: { cwd: string; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams

interface CodexAppServerOptions {
    spawnProcess?: SpawnProcess
    requestTimeoutMs?: number
    exitDrainTimeoutMs?: number
    diagnosticSink?: (message: string) => void
    diagnosticBufferSize?: number
}

export type AgentRuntimeHealth =
    | { status: 'healthy'; capabilities: AgentCapability[] }
    | { status: 'unavailable'; capabilities: []; error: string }

export interface StartedAgentTask {
    threadId: string
    turnId: string
}

export interface AgentRuntimePermission extends AgentPermissionRequired {
    threadId: string
    turnId: string | null
}

export type AgentRuntimeEvent =
    | { type: 'permission-required'; permission: AgentRuntimePermission }
    | { type: 'permission-resolved'; threadId: string; permissionId: string }
    | {
          type: 'activity'
          threadId: string
          turnId: string
          activity: 'web-search' | 'tool-use' | 'local-read' | 'delegation' | 'plan-update'
      }
    | {
          type: 'reasoning-delta'
          threadId: string
          turnId: string
          itemId: string
          summaryIndex: number
          textDelta: string
      }
    | { type: 'final-message'; threadId: string; turnId: string; text: string }
    | {
          type: 'turn-completed'
          threadId: string
          turnId: string
          status: 'completed' | 'interrupted' | 'failed'
          error: string | null
      }
    | { type: 'runtime-failed'; error: Error }

export interface AgentRuntime {
    readonly health: AgentRuntimeHealth
    startTask(taskId: string, input: StartAgentTaskInput): Promise<StartedAgentTask>
    interruptTask(threadId: string, turnId: string): Promise<void>
    resolvePermission(permissionId: string, decision: AgentPermissionDecision): boolean
    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void
}

const pluginIds = {
    chrome: 'chrome@openai-bundled',
} satisfies Record<AgentCapability, string>

const rpcIdSchema = z.union([z.string(), z.number().int()])
const rpcErrorSchema = z.object({ code: z.number().int(), message: z.string() })
const emptyResponseSchema = z.object({})
const pluginInstalledResponseSchema = z.object({
    marketplaces: z.array(
        z.object({
            plugins: z.array(
                z.object({
                    id: z.string(),
                    installed: z.boolean(),
                    enabled: z.boolean(),
                    availability: z.string(),
                    source: z.object({
                        type: z.string(),
                        path: z.string().min(1).optional(),
                    }),
                }),
            ),
        }),
    ),
})
const threadStartResponseSchema = z.object({
    thread: z.object({ id: z.string().min(1) }),
})
const turnStartResponseSchema = z.object({
    turn: z.object({ id: z.string().min(1) }),
})
const turnReferenceSchema = z.object({
    threadId: z.string().min(1),
    turnId: z.string().min(1),
})
const permissionResolvedSchema = z.object({
    threadId: z.string().min(1),
    requestId: rpcIdSchema,
})
const itemStartedSchema = turnReferenceSchema.extend({
    item: z.object({ type: z.string() }),
})
const reasoningDeltaSchema = turnReferenceSchema.extend({
    itemId: z.string().min(1),
    summaryIndex: z.number().int().nonnegative(),
    delta: z.string(),
})
const itemCompletedSchema = turnReferenceSchema.extend({
    item: z.object({
        type: z.string(),
        phase: z.string().nullable().optional(),
        text: z.string().optional(),
    }),
})
const turnCompletedSchema = z.object({
    threadId: z.string().min(1),
    turn: z.object({
        id: z.string().min(1),
        status: z.enum(['completed', 'interrupted', 'failed']),
        error: z.object({ message: z.string() }).nullable().optional(),
    }),
})

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null

const rpcIdKey = (id: RpcId) => `${typeof id}:${id}`

const browserOriginPermission = (params: unknown): AgentRuntimePermission | null => {
    if (!isObject(params)) {
        return null
    }

    const meta = isObject(params._meta) ? params._meta : isObject(params.meta) ? params.meta : null
    const threadId = stringValue(params.threadId)
    const invalidTurnId =
        params.turnId !== undefined && params.turnId !== null && stringValue(params.turnId) === null
    const turnId = params.turnId === null ? null : stringValue(params.turnId)
    const message = stringValue(params.message)
    const origin = meta === null ? null : stringValue(meta.origin)

    if (
        meta === null ||
        meta.connector_id !== 'browser-use' ||
        meta.tool_name !== 'access_browser_origin' ||
        threadId === null ||
        invalidTurnId ||
        message === null ||
        origin === null
    ) {
        return null
    }

    return {
        id: randomUUID(),
        kind: 'browser-origin',
        threadId,
        turnId,
        message,
        origin,
    }
}

export class CodexAppServer implements AgentRuntime {
    private process: ChildProcessWithoutNullStreams | null = null
    private output: Interface | null = null
    private requestId = 0
    private readonly pendingRequests = new Map<RpcId, PendingRequest>()
    private readonly pendingPermissions = new Map<string, PendingPermission>()
    private readonly permissionIdsByRequest = new Map<string, string>()
    private readonly capabilityRoots = new Map<AgentCapability, string>()
    private readonly queuedEvents: AgentRuntimeEvent[] = []
    private eventFlushScheduled = false
    private readonly eventListeners = new Set<(event: AgentRuntimeEvent) => void>()
    private readonly spawnProcess: SpawnProcess
    private readonly requestTimeoutMs: number
    private readonly exitDrainTimeoutMs: number
    private readonly diagnosticSink: (message: string) => void
    private readonly diagnosticBufferSize: number
    private stderrTail = ''
    private diagnosticPending = false
    private processExitError: Error | null = null
    private exitDrainTimeout: ReturnType<typeof setTimeout> | null = null
    private startAttempted = false
    private ready = false
    private runtimeError = new Error('Agent runtime has not started')

    constructor(
        private readonly binary: string,
        private readonly cwd: string,
        {
            spawnProcess = spawn,
            requestTimeoutMs = 15_000,
            exitDrainTimeoutMs = 1_000,
            diagnosticSink = console.error,
            diagnosticBufferSize = 4_096,
        }: CodexAppServerOptions = {},
    ) {
        if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
            throw new Error('Agent runtime request timeout must be a positive integer')
        }

        if (!Number.isSafeInteger(exitDrainTimeoutMs) || exitDrainTimeoutMs <= 0) {
            throw new Error('Agent runtime exit drain timeout must be a positive integer')
        }

        if (!Number.isSafeInteger(diagnosticBufferSize) || diagnosticBufferSize <= 0) {
            throw new Error('Agent runtime diagnostic buffer size must be a positive integer')
        }

        this.spawnProcess = spawnProcess
        this.requestTimeoutMs = requestTimeoutMs
        this.exitDrainTimeoutMs = exitDrainTimeoutMs
        this.diagnosticSink = diagnosticSink
        this.diagnosticBufferSize = diagnosticBufferSize
    }

    get health(): AgentRuntimeHealth {
        return this.ready
            ? { status: 'healthy', capabilities: [...this.capabilityRoots.keys()] }
            : {
                  status: 'unavailable',
                  capabilities: [],
                  error: this.runtimeError.message,
              }
    }

    async start(): Promise<void> {
        if (this.ready) {
            return
        }

        if (this.startAttempted) {
            throw new Error('Agent runtime cannot restart in-process; restart the Agent bridge')
        }

        this.startAttempted = true
        this.ready = false
        this.runtimeError = new Error('Agent runtime is starting')
        this.stderrTail = ''
        this.diagnosticPending = false
        this.processExitError = null
        this.clearExitDrainTimeout()
        let child: ChildProcessWithoutNullStreams

        try {
            child = this.spawnProcess(this.binary, ['app-server', '--stdio'], {
                cwd: this.cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            })
        } catch (error) {
            this.runtimeError =
                error instanceof Error ? error : new Error('Could not start Agent runtime')
            throw this.runtimeError
        }

        this.process = child
        this.output = createInterface({ input: child.stdout })
        this.output.on('line', (line) => this.handleLine(line))
        this.output.once('close', () => {
            if (this.process === child) {
                const error =
                    this.processExitError ??
                    new Error('Agent runtime protocol stream closed unexpectedly')
                this.handleExit(error, this.processExitError === null)
            }
        })
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk: string) => this.captureDiagnostic(chunk))
        child.stderr.once('error', (error) => this.handleExit(error))
        child.stdin.once('error', (error) => this.handleExit(error))
        child.stdout.once('error', (error) => this.handleExit(error))
        child.once('error', (error) => this.handleExit(error))
        child.once('close', () => {
            if (this.process === child) {
                this.handleExit(
                    this.processExitError ?? new Error('Agent runtime process closed unexpectedly'),
                    false,
                )
            }

            this.flushDiagnostic()
        })
        child.once('exit', (code, signal) => {
            this.handleProcessExit(
                child,
                new Error(
                    code !== null
                        ? `Agent runtime exited with code ${code}`
                        : `Agent runtime exited with signal ${signal ?? 'unknown'}`,
                ),
            )
        })

        try {
            await this.request(
                'initialize',
                {
                    clientInfo: {
                        name: 'job-search-facilitator',
                        title: 'Job Search Facilitator',
                        version: '0.1.0',
                    },
                    capabilities: {
                        experimentalApi: true,
                        mcpServerOpenaiFormElicitation: true,
                        requestAttestation: false,
                    },
                },
                emptyResponseSchema,
            )
            this.send({ method: 'initialized' })
            await this.loadCapabilities()

            if (this.process !== child || this.processExitError !== null) {
                throw this.runtimeError
            }

            this.ready = true
        } catch (error) {
            if (this.process !== null) {
                this.handleExit(
                    error instanceof Error ? error : new Error('Could not start Agent runtime'),
                )
            }
            throw error
        }
    }

    async startTask(taskId: string, input: StartAgentTaskInput): Promise<StartedAgentTask> {
        this.assertReady()
        const selectedCapabilityRoots = input.capabilities.map((capability) => {
            const path = this.capabilityRoots.get(capability)

            if (path === undefined) {
                throw new Error(`Agent capability is unavailable: ${capability}`)
            }

            return {
                id: pluginIds[capability],
                location: { type: 'environment', environmentId: 'workspace', path },
            }
        })
        const { thread } = await this.request(
            'thread/start',
            {
                cwd: this.cwd,
                approvalPolicy: {
                    granular: {
                        sandbox_approval: false,
                        rules: false,
                        skill_approval: false,
                        request_permissions: false,
                        mcp_elicitations: true,
                    },
                },
                approvalsReviewer: 'user',
                sandbox: 'read-only',
                threadSource: 'job-search-facilitator',
                selectedCapabilityRoots,
            },
            threadStartResponseSchema,
        )
        const { turn } = await this.request(
            'turn/start',
            {
                threadId: thread.id,
                clientUserMessageId: taskId,
                input: [{ type: 'text', text: input.prompt, text_elements: [] }],
                outputSchema: input.outputSchema,
                summary: 'concise',
            },
            turnStartResponseSchema,
        )
        this.assertReady()

        return { threadId: thread.id, turnId: turn.id }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        this.assertReady()
        await this.request('turn/interrupt', { threadId, turnId }, emptyResponseSchema)
        this.assertReady()
    }

    resolvePermission(permissionId: string, decision: AgentPermissionDecision): boolean {
        if (!this.ready) {
            return false
        }

        const pending = this.pendingPermissions.get(permissionId)

        if (pending === undefined) {
            return false
        }

        if (pending.decision !== null) {
            return pending.decision === decision
        }

        this.send({
            id: pending.requestId,
            result: {
                action: decision === 'approve' ? 'accept' : 'decline',
                content: null,
                _meta: null,
            },
        })
        pending.decision = decision

        return true
    }

    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    close(): void {
        const child = this.process

        if (child === null) {
            return
        }

        this.process = null
        this.output?.close()
        this.output = null
        this.diagnosticPending = false
        this.clearExitDrainTimeout()
        const error = this.processExitError ?? new Error('Agent runtime closed')
        this.processExitError = null
        child.kill()
        this.ready = false
        this.runtimeError = error
        this.capabilityRoots.clear()
        this.rejectPending(error)
        this.pendingPermissions.clear()
        this.permissionIdsByRequest.clear()
        this.queuedEvents.length = 0
    }

    private async loadCapabilities(): Promise<void> {
        const response = await this.request(
            'plugin/installed',
            { cwds: [this.cwd] },
            pluginInstalledResponseSchema,
        )
        const plugins = response.marketplaces.flatMap(({ plugins }) => plugins)

        for (const capability of Object.keys(pluginIds) as AgentCapability[]) {
            const plugin = plugins.find(({ id }) => id === pluginIds[capability])

            if (
                plugin?.installed === true &&
                plugin.enabled &&
                plugin.availability === 'AVAILABLE' &&
                plugin.source.type === 'local' &&
                plugin.source.path !== undefined &&
                isAbsolute(plugin.source.path)
            ) {
                this.capabilityRoots.set(capability, plugin.source.path)
            }
        }
    }

    private request<T>(method: string, params: unknown, resultSchema: z.ZodType<T>): Promise<T> {
        const id = ++this.requestId

        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.pendingRequests.has(id)) {
                    return
                }

                this.handleExit(
                    new Error(
                        `Agent runtime request "${method}" timed out after ${this.requestTimeoutMs}ms`,
                    ),
                )
            }, this.requestTimeoutMs)
            timeout.unref()
            this.pendingRequests.set(id, {
                method,
                resolveResult: (value) => {
                    const result = resultSchema.safeParse(value)

                    if (!result.success) {
                        return false
                    }

                    resolve(result.data)
                    return true
                },
                reject,
                timeout,
            })

            try {
                this.send({ id, method, params })
            } catch (error) {
                clearTimeout(timeout)
                this.pendingRequests.delete(id)
                reject(error instanceof Error ? error : new Error('Could not send Agent request'))
            }
        })
    }

    private send(message: OutgoingRpcMessage): void {
        if (this.process === null || this.processExitError !== null) {
            throw new Error('Agent runtime is not running')
        }

        this.process.stdin.write(`${JSON.stringify(message)}\n`)
    }

    private handleLine(line: string): void {
        let message: unknown

        try {
            message = JSON.parse(line)
        } catch {
            this.handleExit(new Error('Agent runtime returned malformed JSON'))
            return
        }

        if (!isObject(message)) {
            this.handleExit(new Error('Agent runtime returned an invalid JSON-RPC message'))
            return
        }

        const hasId = Object.hasOwn(message, 'id')
        const hasMethod = Object.hasOwn(message, 'method')
        const hasResult = Object.hasOwn(message, 'result')
        const hasError = Object.hasOwn(message, 'error')

        if (hasMethod) {
            if (
                typeof message.method !== 'string' ||
                message.method.length === 0 ||
                hasResult ||
                hasError
            ) {
                this.handleExit(new Error('Agent runtime returned an invalid JSON-RPC message'))
                return
            }

            if (!hasId) {
                this.handleNotification(message.method, message.params)
                return
            }

            const id = rpcIdSchema.safeParse(message.id)

            if (!id.success) {
                this.handleExit(new Error('Agent runtime returned an invalid JSON-RPC message'))
                return
            }

            this.handleServerRequest(id.data, message.method, message.params)
            return
        }

        if (!hasId) {
            this.handleExit(new Error('Agent runtime returned an invalid JSON-RPC message'))
            return
        }

        const id = rpcIdSchema.safeParse(message.id)

        if (!id.success || hasResult === hasError) {
            this.handleExit(new Error('Agent runtime returned an invalid JSON-RPC response'))
            return
        }

        const pending = this.pendingRequests.get(id.data)

        if (pending === undefined) {
            return
        }

        if (hasError) {
            const rpcError = rpcErrorSchema.safeParse(message.error)

            if (!rpcError.success) {
                this.handleExit(new Error('Agent runtime returned an invalid JSON-RPC response'))
                return
            }

            this.pendingRequests.delete(id.data)
            clearTimeout(pending.timeout)
            pending.reject(
                new Error(
                    `Agent runtime request "${pending.method}" failed: ${rpcError.data.message}`,
                ),
            )
            return
        }

        if (!pending.resolveResult(message.result)) {
            this.handleExit(
                new Error(`Agent runtime returned invalid response for "${pending.method}"`),
            )
            return
        }

        this.pendingRequests.delete(id.data)
        clearTimeout(pending.timeout)
    }

    private handleServerRequest(id: RpcId, method: string, params: unknown): void {
        if (this.processExitError !== null) {
            return
        }

        if (method === 'mcpServer/elicitation/request') {
            const permission = browserOriginPermission(params)

            if (permission !== null) {
                this.pendingPermissions.set(permission.id, {
                    requestId: id,
                    permission,
                    decision: null,
                })
                this.permissionIdsByRequest.set(rpcIdKey(id), permission.id)
                this.queueEvent({ type: 'permission-required', permission })
                return
            }
        }

        let result: JsonObject | null = null

        switch (method) {
            case 'item/commandExecution/requestApproval':
            case 'item/fileChange/requestApproval':
                result = { decision: 'decline' }
                break
            case 'item/permissions/requestApproval':
                result = { permissions: {}, scope: 'turn' }
                break
            case 'mcpServer/elicitation/request':
                result = { action: 'cancel', content: null, _meta: null }
                break
        }

        if (result === null) {
            this.send({
                id,
                error: { code: -32601, message: 'Unsupported server request' },
            })
        } else {
            this.send({ id, result })
        }
    }

    private handleNotification(method: string, params: unknown): void {
        if (method === 'serverRequest/resolved') {
            const notification = this.parseNotification(method, permissionResolvedSchema, params)

            if (notification === null) {
                return
            }

            const requestKey = rpcIdKey(notification.requestId)
            const permissionId = this.permissionIdsByRequest.get(requestKey)

            if (permissionId === undefined) {
                return
            }

            const pendingPermission = this.pendingPermissions.get(permissionId)

            if (
                pendingPermission === undefined ||
                pendingPermission.permission.threadId !== notification.threadId
            ) {
                this.failNotification(method)
                return
            }

            this.pendingPermissions.delete(permissionId)
            this.permissionIdsByRequest.delete(requestKey)
            this.queueEvent({
                type: 'permission-resolved',
                threadId: pendingPermission.permission.threadId,
                permissionId,
            })
            return
        }

        if (method === 'item/started') {
            const notification = this.parseNotification(method, itemStartedSchema, params)

            if (notification === null) {
                return
            }

            const activity = {
                webSearch: 'web-search',
                mcpToolCall: 'tool-use',
                commandExecution: 'local-read',
                collabAgentToolCall: 'delegation',
            }[notification.item.type] as
                | Extract<AgentRuntimeEvent, { type: 'activity' }>['activity']
                | undefined

            if (activity !== undefined) {
                this.queueEvent({
                    type: 'activity',
                    threadId: notification.threadId,
                    turnId: notification.turnId,
                    activity,
                })
            }

            return
        }

        if (method === 'item/reasoning/summaryTextDelta') {
            const notification = this.parseNotification(method, reasoningDeltaSchema, params)

            if (notification !== null) {
                this.queueEvent({
                    type: 'reasoning-delta',
                    threadId: notification.threadId,
                    turnId: notification.turnId,
                    itemId: notification.itemId,
                    summaryIndex: notification.summaryIndex,
                    textDelta: notification.delta,
                })
            }

            return
        }

        if (method === 'item/completed') {
            const notification = this.parseNotification(method, itemCompletedSchema, params)

            if (notification === null || notification.item.type !== 'agentMessage') {
                return
            }

            if (
                notification.item.phase !== undefined &&
                notification.item.phase !== null &&
                notification.item.phase !== 'final_answer'
            ) {
                return
            }

            if (notification.item.text === undefined) {
                this.failNotification(method)
                return
            }

            this.queueEvent({
                type: 'final-message',
                threadId: notification.threadId,
                turnId: notification.turnId,
                text: notification.item.text,
            })
            return
        }

        if (method === 'turn/plan/updated') {
            const notification = this.parseNotification(method, turnReferenceSchema, params)

            if (notification !== null) {
                this.queueEvent({
                    type: 'activity',
                    threadId: notification.threadId,
                    turnId: notification.turnId,
                    activity: 'plan-update',
                })
            }

            return
        }

        if (method === 'turn/completed') {
            const notification = this.parseNotification(method, turnCompletedSchema, params)

            if (notification === null) {
                return
            }

            this.queueEvent({
                type: 'turn-completed',
                threadId: notification.threadId,
                turnId: notification.turn.id,
                status: notification.turn.status,
                error: notification.turn.error?.message ?? null,
            })
        }
    }

    private parseNotification<T>(method: string, schema: z.ZodType<T>, params: unknown): T | null {
        const notification = schema.safeParse(params)

        if (!notification.success) {
            this.failNotification(method)
            return null
        }

        return notification.data
    }

    private failNotification(method: string): void {
        this.handleExit(new Error(`Agent runtime returned invalid "${method}" notification`))
    }

    private queueEvent(event: AgentRuntimeEvent): void {
        this.queuedEvents.push(event)

        if (this.eventFlushScheduled) {
            return
        }

        this.eventFlushScheduled = true
        setImmediate(() => {
            this.eventFlushScheduled = false

            for (const queuedEvent of this.queuedEvents.splice(0)) {
                for (const listener of this.eventListeners) {
                    listener(queuedEvent)
                }
            }
        })
    }

    private handleProcessExit(child: ChildProcessWithoutNullStreams, error: Error): void {
        if (this.process !== child) {
            return
        }

        this.ready = false
        this.runtimeError = error
        this.capabilityRoots.clear()
        this.rejectPending(error)
        this.processExitError = error
        const timeout = setTimeout(() => {
            if (this.process !== child || this.processExitError !== error) {
                return
            }

            this.handleExit(error, false)
            this.flushDiagnostic()
        }, this.exitDrainTimeoutMs)
        timeout.unref()
        this.exitDrainTimeout = timeout
    }

    private handleExit(error: Error, killChild = true): void {
        const child = this.process

        if (child === null) {
            return
        }

        this.process = null
        this.clearExitDrainTimeout()
        this.output?.close()
        this.output = null
        this.diagnosticPending = true
        this.processExitError = null

        if (killChild) {
            child.kill()
        }

        this.ready = false
        this.runtimeError = error
        this.capabilityRoots.clear()
        this.rejectPending(error)
        this.pendingPermissions.clear()
        this.permissionIdsByRequest.clear()

        this.queueEvent({ type: 'runtime-failed', error })
    }

    private assertReady(): void {
        if (!this.ready) {
            throw this.runtimeError
        }
    }

    private captureDiagnostic(chunk: string): void {
        this.stderrTail = `${this.stderrTail}${chunk}`.slice(-this.diagnosticBufferSize)
    }

    private clearExitDrainTimeout(): void {
        if (this.exitDrainTimeout !== null) {
            clearTimeout(this.exitDrainTimeout)
            this.exitDrainTimeout = null
        }
    }

    private flushDiagnostic(): void {
        if (!this.diagnosticPending) {
            return
        }

        this.diagnosticPending = false
        const diagnostic = this.stderrTail.trim()

        if (diagnostic.length === 0) {
            return
        }

        try {
            this.diagnosticSink(`Agent runtime stderr before failure:\n${diagnostic}`)
        } catch {
            // Diagnostics must not interfere with runtime failure handling.
        }
    }

    private rejectPending(error: Error): void {
        for (const { reject, timeout } of this.pendingRequests.values()) {
            clearTimeout(timeout)
            reject(error)
        }

        this.pendingRequests.clear()
    }
}
