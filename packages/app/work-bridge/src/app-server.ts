import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface, type Interface } from 'node:readline'
import type {
    JsonObject,
    StartWorkTaskInput,
    WorkActionDecision,
    WorkActionRequired,
    WorkCapability,
} from '@job-search-facilitator/core'

type RpcId = number | string

interface RpcMessage {
    id?: RpcId
    method?: string
    params?: unknown
    result?: unknown
    error?: { code: number; message: string }
}

export interface AppServerNotification {
    method: string
    params: JsonObject
}

interface InstalledPlugin {
    id: string
    installed: boolean
    enabled: boolean
    availability: string
    source: { type: string; path?: string }
}

interface PluginInstalledResponse {
    marketplaces: Array<{ plugins: InstalledPlugin[] }>
}

interface ThreadStartResponse {
    thread: { id: string }
}

interface TurnStartResponse {
    turn: { id: string }
}

interface PendingRequest {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

interface PendingAction {
    requestId: RpcId
    action: WorkRuntimeAction
    decision: WorkActionDecision | null
}

type SpawnProcess = (
    command: string,
    args: string[],
    options: { cwd: string; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams

export interface StartedWorkTask {
    threadId: string
    turnId: string
}

export interface WorkRuntimeAction extends WorkActionRequired {
    threadId: string
    turnId: string | null
}

export interface WorkRuntime {
    readonly capabilities: WorkCapability[]
    startTask(taskId: string, input: StartWorkTaskInput): Promise<StartedWorkTask>
    interruptTask(threadId: string, turnId: string): Promise<void>
    resolveAction(actionId: string, decision: WorkActionDecision): boolean
    onActionRequired(listener: (action: WorkRuntimeAction) => void): () => void
    onNotification(listener: (notification: AppServerNotification) => void): () => void
    onExit(listener: (error: Error) => void): () => void
}

const pluginIds = {
    chrome: 'chrome@openai-bundled',
} satisfies Record<WorkCapability, string>

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const rpcIdValue = (value: unknown): RpcId | null =>
    typeof value === 'string' || typeof value === 'number' ? value : null

const rpcIdKey = (id: RpcId) => `${typeof id}:${id}`

const browserOriginAction = (params: unknown): WorkRuntimeAction | null => {
    if (!isObject(params)) {
        return null
    }

    const meta = isObject(params._meta) ? params._meta : isObject(params.meta) ? params.meta : null
    const threadId = stringValue(params.threadId)
    const turnId = params.turnId === null ? null : stringValue(params.turnId)
    const message = stringValue(params.message)
    const origin = meta === null ? null : stringValue(meta.origin)

    if (
        meta === null ||
        meta.connector_id !== 'browser-use' ||
        meta.tool_name !== 'access_browser_origin' ||
        threadId === null ||
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

export class CodexAppServer implements WorkRuntime {
    private process: ChildProcessWithoutNullStreams | null = null
    private output: Interface | null = null
    private requestId = 0
    private readonly pendingRequests = new Map<RpcId, PendingRequest>()
    private readonly pendingActions = new Map<string, PendingAction>()
    private readonly actionIdsByRequest = new Map<string, string>()
    private readonly capabilityRoots = new Map<WorkCapability, string>()
    private readonly queuedNotifications: AppServerNotification[] = []
    private notificationFlushScheduled = false
    private readonly notificationListeners = new Set<
        (notification: AppServerNotification) => void
    >()
    private readonly actionListeners = new Set<(action: WorkRuntimeAction) => void>()
    private readonly exitListeners = new Set<(error: Error) => void>()

    constructor(
        private readonly binary: string,
        private readonly cwd: string,
        private readonly spawnProcess: SpawnProcess = spawn,
    ) {}

    get capabilities(): WorkCapability[] {
        return [...this.capabilityRoots.keys()]
    }

    async start(): Promise<void> {
        if (this.process !== null) {
            return
        }

        const child = this.spawnProcess(this.binary, ['app-server', '--stdio'], {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        })
        this.process = child
        this.output = createInterface({ input: child.stdout })
        this.output.on('line', (line) => this.handleLine(line))
        child.stderr.resume()
        child.stdin.once('error', (error) => this.handleExit(error))
        child.once('error', (error) => this.handleExit(error))
        child.once('exit', (code) => {
            if (this.process !== null) {
                this.handleExit(
                    new Error(`Work runtime exited${code === null ? '' : ` (${code})`}`),
                )
            }
        })

        try {
            await this.request('initialize', {
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
            })
            this.send({ method: 'initialized' })
            await this.loadCapabilities()
        } catch (error) {
            this.close()
            throw error
        }
    }

    async startTask(taskId: string, input: StartWorkTaskInput): Promise<StartedWorkTask> {
        const selectedCapabilityRoots = input.capabilities.map((capability) => {
            const path = this.capabilityRoots.get(capability)

            if (path === undefined) {
                throw new Error(`Work capability is unavailable: ${capability}`)
            }

            return {
                id: pluginIds[capability],
                location: { type: 'environment', environmentId: 'workspace', path },
            }
        })
        const { thread } = await this.request<ThreadStartResponse>('thread/start', {
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
        })
        const { turn } = await this.request<TurnStartResponse>('turn/start', {
            threadId: thread.id,
            clientUserMessageId: taskId,
            input: [{ type: 'text', text: input.prompt, text_elements: [] }],
            outputSchema: input.outputSchema,
            summary: 'concise',
        })

        return { threadId: thread.id, turnId: turn.id }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        await this.request('turn/interrupt', { threadId, turnId })
    }

    resolveAction(actionId: string, decision: WorkActionDecision): boolean {
        const pending = this.pendingActions.get(actionId)

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

    onActionRequired(listener: (action: WorkRuntimeAction) => void): () => void {
        this.actionListeners.add(listener)
        return () => this.actionListeners.delete(listener)
    }

    onNotification(listener: (notification: AppServerNotification) => void): () => void {
        this.notificationListeners.add(listener)
        return () => this.notificationListeners.delete(listener)
    }

    onExit(listener: (error: Error) => void): () => void {
        this.exitListeners.add(listener)
        return () => this.exitListeners.delete(listener)
    }

    close(): void {
        const child = this.process
        this.process = null
        this.output?.close()
        this.output = null
        child?.kill()
        this.rejectPending(new Error('Work runtime closed'))
        this.pendingActions.clear()
        this.actionIdsByRequest.clear()
    }

    private async loadCapabilities(): Promise<void> {
        const response = await this.request<PluginInstalledResponse>('plugin/installed', {
            cwds: [this.cwd],
        })
        const plugins = response.marketplaces.flatMap(({ plugins }) => plugins)

        for (const capability of Object.keys(pluginIds) as WorkCapability[]) {
            const plugin = plugins.find(({ id }) => id === pluginIds[capability])

            if (
                plugin?.installed === true &&
                plugin.enabled &&
                plugin.availability === 'AVAILABLE' &&
                plugin.source.type === 'local' &&
                plugin.source.path !== undefined
            ) {
                this.capabilityRoots.set(capability, plugin.source.path)
            }
        }
    }

    private request<T>(method: string, params: unknown): Promise<T> {
        const id = ++this.requestId

        return new Promise<T>((resolve, reject) => {
            this.pendingRequests.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
            })

            try {
                this.send({ id, method, params })
            } catch (error) {
                this.pendingRequests.delete(id)
                reject(error instanceof Error ? error : new Error('Could not send Work request'))
            }
        })
    }

    private send(message: RpcMessage): void {
        if (this.process === null) {
            throw new Error('Work runtime is not running')
        }

        this.process.stdin.write(`${JSON.stringify(message)}\n`)
    }

    private handleLine(line: string): void {
        let message: unknown

        try {
            message = JSON.parse(line)
        } catch {
            this.handleExit(new Error('Work runtime returned malformed JSON'))
            return
        }

        if (!isObject(message)) {
            return
        }

        const rpcMessage = message as RpcMessage
        const hasId = Object.hasOwn(rpcMessage, 'id')

        if (rpcMessage.method !== undefined && hasId) {
            this.handleServerRequest(rpcMessage)
        } else if (rpcMessage.method !== undefined) {
            let params = isObject(rpcMessage.params) ? rpcMessage.params : {}

            if (rpcMessage.method === 'serverRequest/resolved') {
                const requestId = rpcIdValue(params.requestId)

                if (requestId !== null) {
                    const requestKey = rpcIdKey(requestId)
                    const actionId = this.actionIdsByRequest.get(requestKey)

                    if (actionId !== undefined) {
                        this.pendingActions.delete(actionId)
                        this.actionIdsByRequest.delete(requestKey)
                        params = { ...params, actionId }
                    }
                }
            }

            this.queueNotification({ method: rpcMessage.method, params })
        } else if (hasId && rpcMessage.id !== undefined) {
            const pending = this.pendingRequests.get(rpcMessage.id)

            if (pending === undefined) {
                return
            }

            this.pendingRequests.delete(rpcMessage.id)

            if (rpcMessage.error === undefined) {
                pending.resolve(rpcMessage.result)
            } else {
                pending.reject(new Error(rpcMessage.error.message))
            }
        }
    }

    private handleServerRequest(message: RpcMessage): void {
        if (message.id === undefined || message.method === undefined) {
            return
        }

        if (message.method === 'mcpServer/elicitation/request') {
            const action = browserOriginAction(message.params)

            if (action !== null) {
                this.pendingActions.set(action.id, {
                    requestId: message.id,
                    action,
                    decision: null,
                })
                this.actionIdsByRequest.set(rpcIdKey(message.id), action.id)
                setImmediate(() => {
                    for (const listener of this.actionListeners) {
                        listener(action)
                    }
                })
                return
            }
        }

        let result: JsonObject | null = null

        switch (message.method) {
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
                id: message.id,
                error: { code: -32601, message: 'Unsupported server request' },
            })
        } else {
            this.send({ id: message.id, result })
        }
    }

    private queueNotification(notification: AppServerNotification): void {
        this.queuedNotifications.push(notification)

        if (this.notificationFlushScheduled) {
            return
        }

        this.notificationFlushScheduled = true
        setImmediate(() => {
            this.notificationFlushScheduled = false

            for (const queuedNotification of this.queuedNotifications.splice(0)) {
                for (const listener of this.notificationListeners) {
                    listener(queuedNotification)
                }
            }
        })
    }

    private handleExit(error: Error): void {
        const child = this.process

        if (child === null) {
            return
        }

        this.process = null
        this.output?.close()
        this.output = null
        child.kill()
        this.rejectPending(error)
        this.pendingActions.clear()
        this.actionIdsByRequest.clear()

        for (const listener of this.exitListeners) {
            listener(error)
        }
    }

    private rejectPending(error: Error): void {
        for (const { reject } of this.pendingRequests.values()) {
            reject(error)
        }

        this.pendingRequests.clear()
    }
}
