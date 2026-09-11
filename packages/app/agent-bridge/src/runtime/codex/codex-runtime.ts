import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type {
    AgentCapability,
    AgentPermissionDecision,
    JsonObject,
    StartAgentTaskInput,
} from '@job-search-facilitator/core'
import { z } from 'zod'
import type {
    AgentRuntime,
    AgentRuntimeEvent,
    AgentRuntimeHealth,
    AgentRuntimePermission,
    StartedAgentTask,
} from '../agent-runtime.ts'
import { AppServerConnection, type AppServerConnectionOptions } from './app-server-connection.ts'
import {
    emptyResponseSchema,
    isObject,
    itemCompletedSchema,
    itemStartedSchema,
    permissionResolvedSchema,
    pluginInstalledResponseSchema,
    reasoningDeltaSchema,
    threadStartResponseSchema,
    turnCompletedSchema,
    turnReferenceSchema,
    turnStartResponseSchema,
    type RpcId,
} from './protocol.ts'

interface PendingPermission {
    requestId: RpcId
    permission: AgentRuntimePermission
    decision: AgentPermissionDecision | null
}

interface CodexRuntimeOptions extends AppServerConnectionOptions {
    chromeRoot?: string
}

const pluginIds = {
    chrome: 'chrome@openai-bundled',
} satisfies Record<AgentCapability, string>

const stringValue = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null

const rpcIdKey = (id: RpcId) => `${typeof id}:${id}`

export async function closeTaskTabs(
    connection: AppServerConnection,
    threadId: string,
    turnId: string,
) {
    const result = await connection.request(
        'mcpServer/tool/call',
        {
            threadId,
            server: 'node_repl',
            tool: 'turn_ended',
            arguments: { hook_event_name: 'Stop', session_id: threadId, turn_id: turnId },
        },
        z.object({ isError: z.boolean().optional() }),
    )
    if (result.isError) throw new Error('Could not close the task’s browser tabs')
}

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

export class CodexRuntime implements AgentRuntime {
    private readonly connection: AppServerConnection
    private readonly chromeRoot: string | undefined
    private readonly isolated: boolean
    private readonly pendingPermissions = new Map<string, PendingPermission>()
    private readonly permissionIdsByRequest = new Map<string, string>()
    private readonly capabilityRoots = new Map<AgentCapability, string>()
    private readonly browserThreads = new Map<string, string | null>()
    private readonly browserCleanups = new Map<string, Promise<void>>()
    private readonly queuedEvents: AgentRuntimeEvent[] = []
    private eventFlushScheduled = false
    private readonly eventListeners = new Set<(event: AgentRuntimeEvent) => void>()
    private startAttempted = false
    private ready = false
    private runtimeError = new Error('Agent runtime has not started')

    constructor(
        binary: string,
        private readonly cwd: string,
        options: CodexRuntimeOptions = {},
    ) {
        this.chromeRoot = options.chromeRoot
        this.isolated = options.environment?.CODEX_HOME !== undefined
        this.connection = new AppServerConnection(
            binary,
            cwd,
            {
                onNotification: (method, params) => this.handleNotification(method, params),
                onRequest: (id, method, params) => this.handleServerRequest(id, method, params),
                onUnavailable: (error) => this.markUnavailable(error),
                onFailure: (error) => {
                    this.pendingPermissions.clear()
                    this.permissionIdsByRequest.clear()
                    this.queueEvent({ type: 'runtime-failed', error })
                },
            },
            options,
        )
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

        try {
            this.connection.start()
        } catch (error) {
            this.runtimeError =
                error instanceof Error ? error : new Error('Could not start Agent runtime')
            throw this.runtimeError
        }

        try {
            await this.connection.request(
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
            this.connection.notify('initialized')
            await this.loadCapabilities()

            if (!this.connection.running) {
                throw this.runtimeError
            }

            this.ready = true
        } catch (error) {
            const runtimeError =
                error instanceof Error ? error : new Error('Could not start Agent runtime')

            if (this.connection.active) {
                this.connection.fail(runtimeError)
            } else {
                this.markUnavailable(runtimeError)
            }

            throw error
        }
    }

    async startTask(taskId: string, input: StartAgentTaskInput): Promise<StartedAgentTask> {
        this.assertReady()
        if (input.threadId !== undefined) await this.browserCleanups.get(input.threadId)
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
        const { thread, instructionSources } = await this.connection.request(
            input.threadId === undefined ? 'thread/start' : 'thread/resume',
            {
                ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
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
                developerInstructions:
                    (input.capabilities.includes('chrome')
                        ? 'Use only the supplied task instructions and requested tools. Browser tabs created for this task are temporary. Close every tab you created before returning either success or failure, even after a tool error. Never mark research or error tabs as deliverables or handoffs. Never close existing user tabs or tabs owned by another task. Use only the installed Chrome tool; do not use another browser-control method if it fails.'
                        : 'Follow the supplied task instructions. Return the final result as one JSON object matching the output schema, without surrounding Markdown.') +
                    ' Before each group of tool calls, send one brief commentary sentence describing the immediate action. Use at most 10 words. Keep explanations and reasoning out of these progress updates. Return the final result separately using the output schema.',
                config: {
                    ...(input.webSearch === false ? { web_search: 'disabled' } : {}),
                    ...(this.isolated
                        ? input.capabilities.includes('chrome')
                            ? {
                                  'skills.include_instructions': true,
                                  'mcp_servers.node_repl.enabled': true,
                              }
                            : {
                                  'skills.include_instructions': false,
                                  'mcp_servers.node_repl.enabled': false,
                              }
                        : {}),
                },
            },
            threadStartResponseSchema,
        )

        if (this.isolated && instructionSources?.length !== 0) {
            throw new Error('Agent runtime loaded unexpected instruction files')
        }

        if (input.capabilities.includes('chrome')) this.browserThreads.set(thread.id, null)

        const { turn } = await this.connection.request(
            'turn/start',
            {
                threadId: thread.id,
                clientUserMessageId: taskId,
                input: [
                    { type: 'text', text: input.prompt, text_elements: [] },
                    ...(this.chromeRoot !== undefined && input.capabilities.includes('chrome')
                        ? [
                              {
                                  type: 'skill',
                                  name: 'control-chrome',
                                  path: join(this.chromeRoot, 'skills/control-chrome/SKILL.md'),
                              },
                          ]
                        : []),
                ],
                outputSchema: input.outputSchema,
                summary: 'concise',
            },
            turnStartResponseSchema,
        )
        this.assertReady()

        if (this.browserThreads.has(thread.id)) this.browserThreads.set(thread.id, turn.id)

        return { threadId: thread.id, turnId: turn.id }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        this.assertReady()
        await this.connection.request('turn/interrupt', { threadId, turnId }, emptyResponseSchema)
        await this.cleanupBrowserTabs(threadId, turnId)
        this.assertReady()
    }

    private cleanupBrowserTabs(threadId: string, turnId: string): Promise<void> {
        const pending = this.browserCleanups.get(threadId)
        if (pending !== undefined) return pending
        if (!this.browserThreads.delete(threadId) || !this.connection.running)
            return Promise.resolve()

        const cleanup = closeTaskTabs(this.connection, threadId, turnId)
            .catch(() =>
                this.queueEvent({
                    type: 'commentary',
                    threadId,
                    turnId,
                    text: 'The task ended, but its browser tabs could not be closed.',
                }),
            )
            .finally(() => this.browserCleanups.delete(threadId))
        this.browserCleanups.set(threadId, cleanup)
        return cleanup
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

        this.connection.respond(pending.requestId, {
            action: decision === 'approve' ? 'accept' : 'decline',
            content: null,
            _meta: null,
        })
        pending.decision = decision

        return true
    }

    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    close(): void {
        const error = this.connection.close()

        if (error === null) {
            return
        }

        this.ready = false
        this.runtimeError = error
        this.capabilityRoots.clear()
        this.pendingPermissions.clear()
        this.permissionIdsByRequest.clear()
        this.queuedEvents.length = 0
    }

    async shutdown(): Promise<void> {
        await Promise.allSettled(
            [...this.browserThreads].map(([threadId, turnId]) =>
                turnId === null ? Promise.resolve() : this.interruptTask(threadId, turnId),
            ),
        )
        await Promise.allSettled(this.browserCleanups.values())
        this.close()
    }

    private async loadCapabilities(): Promise<void> {
        if (this.chromeRoot !== undefined) {
            if (isAbsolute(this.chromeRoot) && existsSync(this.chromeRoot)) {
                this.capabilityRoots.set('chrome', this.chromeRoot)
            }
            return
        }

        const response = await this.connection.request(
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
                typeof plugin.source.path === 'string' &&
                isAbsolute(plugin.source.path)
            ) {
                this.capabilityRoots.set(capability, plugin.source.path)
            }
        }
    }

    private handleServerRequest(id: RpcId, method: string, params: unknown): void {
        if (!this.connection.running) {
            return
        }

        const permission =
            method === 'mcpServer/elicitation/request' ? browserOriginPermission(params) : null

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
            this.connection.respondWithError(id, -32601, 'Unsupported server request')
        } else {
            this.connection.respond(id, result)
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
                notification.item.phase !== 'commentary' &&
                notification.item.phase !== 'final_answer'
            ) {
                return
            }

            if (notification.item.text === undefined) {
                this.failNotification(method)
                return
            }

            this.queueEvent({
                type: notification.item.phase === 'commentary' ? 'commentary' : 'final-message',
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

            const event = {
                type: 'turn-completed',
                threadId: notification.threadId,
                turnId: notification.turn.id,
                status: notification.turn.status,
                error: notification.turn.error?.message ?? null,
            } satisfies AgentRuntimeEvent
            this.queueEvent(event)
            void this.cleanupBrowserTabs(notification.threadId, notification.turn.id)
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
        this.connection.fail(new Error(`Agent runtime returned invalid "${method}" notification`))
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

    private markUnavailable(error: Error): void {
        this.ready = false
        this.runtimeError = error
        this.capabilityRoots.clear()
    }

    private assertReady(): void {
        if (!this.ready) {
            throw this.runtimeError
        }
    }
}
