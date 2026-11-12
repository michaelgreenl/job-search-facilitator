import { randomUUID } from 'node:crypto'
import {
    createSdkMcpServer,
    getSessionInfo,
    query as sdkQuery,
    tool,
    type CanUseTool,
    type EffortLevel,
    type HookCallback,
    type Options,
    type Query,
    type SDKMessage,
    type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { createJobPostImportAgentOutputSchema } from '@job-search-facilitator/core'
import { z } from 'zod'
import type {
    AgentModel,
    AgentModelSelection,
    AgentPermissionDecision,
    StartAgentTaskInput,
} from '@job-search-facilitator/core'
import { loadResumeContext } from '../../resume-context.ts'
import type {
    AgentProviderRuntime,
    AgentRuntimeEvent,
    AgentRuntimeHealth,
    StartedAgentTask,
} from '../agent-runtime.ts'
import {
    completeJobPostImport,
    copyDescription,
    type CapturedJobDescription,
    type PageText,
} from '../job-description.ts'
import { progressMessageSchema } from '../progress.ts'

type QueryFunction = (input: {
    prompt: string | AsyncIterable<SDKUserMessage>
    options?: Options
}) => Query

interface ClaudeRuntimeOptions {
    selection: () => AgentModelSelection
    query?: QueryFunction
}

interface Session {
    turnId: string
    abort: AbortController
    chrome: boolean
    permissions: Promise<unknown>
    captures: Map<string, CapturedJobDescription> | null
    pages: Map<string, PageText>
    done: Promise<void>
}

interface PendingPermission {
    decision: AgentPermissionDecision | null
    resolve: (decision: AgentPermissionDecision) => void
}

const bridgeServer = 'job_search'
const chromeServer = 'claude-in-chrome'
const chromeTools = `mcp__${chromeServer}__`
const pageTextTool = `${chromeTools}get_page_text`
const localTools = ['Read', 'Glob', 'Grep']
const webTools = ['WebSearch', 'WebFetch']
const startTimeoutMs = 30_000
const pageTextResult = /^Title: .*\nURL: (\S+)\n(?:.*\n)?---\n([\s\S]*)$/
const captureInput = {
    tabId: z.union([z.number(), z.string()]),
    start: z.string().regex(/\S/).max(400),
    end: z.string().regex(/\S/).max(400),
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** Lists each website origin that a Chrome tool call reads or changes. */
const chromeOrigins = (input: Record<string, unknown>, reason: string | undefined): string[] => {
    const origins = new Set<string>()
    const add = (value: unknown) => {
        if (typeof value !== 'string' || value === 'back' || value === 'forward') return
        try {
            const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`)
            if (url.protocol === 'http:' || url.protocol === 'https:') origins.add(url.origin)
        } catch {
            // A value that is not a URL names no origin.
        }
    }

    add(input.url)
    if (Array.isArray(input.actions)) {
        for (const action of input.actions) {
            if (isObject(action) && isObject(action.input)) add(action.input.url)
        }
    }
    add(/^Claude in Chrome action on (\S+)$/.exec(reason ?? '')?.[1])

    return [...origins]
}

export class ClaudeRuntime implements AgentProviderRuntime {
    private readonly selection: () => AgentModelSelection
    private readonly query: QueryFunction
    private readonly sessions = new Map<string, Session>()
    private readonly approvedOrigins = new Map<string, Set<string>>()
    private readonly pendingPermissions = new Map<string, PendingPermission>()
    private readonly tabCleanups = new Map<string, Promise<void>>()
    private readonly queuedEvents: AgentRuntimeEvent[] = []
    private eventFlushScheduled = false
    private readonly eventListeners = new Set<(event: AgentRuntimeEvent) => void>()
    private models: AgentModel[] = []
    private chrome = false
    private ready = false
    private runtimeError = new Error('Agent runtime has not started')

    constructor(
        private readonly cwd: string,
        options: ClaudeRuntimeOptions,
    ) {
        this.selection = options.selection
        this.query = options.query ?? sdkQuery
    }

    get health(): AgentRuntimeHealth {
        return this.ready
            ? { status: 'healthy', capabilities: this.chrome ? ['chrome'] : [] }
            : { status: 'unavailable', capabilities: [], error: this.runtimeError.message }
    }

    /** Reads the account, model list, and Chrome connection without sending a prompt. */
    async start(): Promise<void> {
        const abort = new AbortController()
        // An input that sends nothing keeps the process open for status requests only.
        const idle: AsyncIterable<SDKUserMessage> = {
            [Symbol.asyncIterator]: () => ({
                next: () =>
                    new Promise((resolve) =>
                        abort.signal.addEventListener('abort', () =>
                            resolve({ done: true, value: undefined }),
                        ),
                    ),
            }),
        }
        const probe = this.query({
            prompt: idle,
            options: { ...this.baseOptions(true), abortController: abort, tools: [] },
        })
        const timeout = setTimeout(() => abort.abort(), startTimeoutMs)

        try {
            const account = await probe.accountInfo()
            if (account.tokenSource === 'none' && account.apiKeySource === undefined) {
                throw new Error('Claude is not signed in. Run "claude /login" in a terminal.')
            }

            this.models = (await probe.supportedModels()).flatMap((model) => {
                const reasoningEfforts = model.supportedEffortLevels ?? []
                return model.value === 'default' || reasoningEfforts.length === 0
                    ? []
                    : [
                          {
                              id: model.resolvedModel ?? model.value,
                              name: model.displayName,
                              reasoningEfforts,
                          },
                      ]
            })
            this.models = this.models.filter(
                (model, index) => this.models.findIndex(({ id }) => id === model.id) === index,
            )

            let chrome = (await probe.mcpServerStatus()).find(({ name }) => name === chromeServer)
            while (chrome?.status === 'pending' && !abort.signal.aborted) {
                await new Promise((resolve) => setTimeout(resolve, 250))
                chrome = (await probe.mcpServerStatus()).find(({ name }) => name === chromeServer)
            }
            this.chrome = chrome?.status === 'connected'
            this.ready = true
        } catch (error) {
            this.runtimeError = abort.signal.aborted
                ? new Error('Claude did not start in time')
                : error instanceof Error
                  ? error
                  : new Error('Could not start Claude')
            throw this.runtimeError
        } finally {
            clearTimeout(timeout)
            abort.abort()
            probe.close()
        }
    }

    listModels(): Promise<AgentModel[]> {
        return Promise.resolve(this.models)
    }

    /** Reports whether a conversation from an earlier bridge process belongs to Claude. */
    async ownsThread(threadId: string): Promise<boolean> {
        return (
            this.sessions.has(threadId) ||
            (await getSessionInfo(threadId, { dir: this.cwd })) !== undefined
        )
    }

    async startTask(_taskId: string, input: StartAgentTaskInput): Promise<StartedAgentTask> {
        this.assertReady()
        const chrome = input.capabilities.includes('chrome')
        if (input.captureJobDescription && (!chrome || input.threadId !== undefined)) {
            throw new Error('Description capture requires a new Chrome task')
        }
        if (chrome && !this.chrome) throw new Error('Agent capability is unavailable: chrome')

        const threadId = input.threadId ?? randomUUID()
        if (this.sessions.has(threadId)) {
            throw new Error('This conversation already has a running Agent task')
        }
        const resumeContext = input.resumeContext ? await loadResumeContext() : ''
        await this.tabCleanups.get(threadId)

        const turnId = randomUUID()
        const { model, reasoningEffort } = this.selection()
        const session: Session = {
            turnId,
            abort: new AbortController(),
            chrome,
            permissions: Promise.resolve(),
            captures: input.captureJobDescription ? new Map() : null,
            pages: new Map(),
            done: Promise.resolve(),
        }
        const report = tool(
            'report_progress',
            'Show the current work step to the user. Report each distinct check, including checks within the same browser session. Select the closest allowed message before beginning that check. Do not repeat a message for each tool call.',
            progressMessageSchema.shape,
            ({ message }) => {
                this.queueEvent({ type: 'commentary', threadId, turnId, text: message })
                return Promise.resolve({ content: [] })
            },
        )
        const stream = this.query({
            prompt: input.prompt,
            options: {
                ...this.baseOptions(chrome),
                ...(input.threadId === undefined ? { sessionId: threadId } : { resume: threadId }),
                abortController: session.abort,
                model,
                effort: reasoningEffort as EffortLevel,
                systemPrompt: [
                    resumeContext,
                    chrome
                        ? 'Use only the supplied task instructions and requested tools. Browser tabs created for this task are temporary. Close every tab you created before returning either success or failure, even after a tool error. Never close existing user tabs or tabs owned by another task. Use only the Claude in Chrome tools; do not use another browser-control method if they fail.'
                        : 'Follow the supplied task instructions.',
                    'A page or tool failure does not by itself make the task fail. Preserve verified information and complete all required work that remains possible. Recover from ordinary tool or navigation errors using permitted tools and sources when useful. After a permission is declined, stop the blocked action without bypassing the restriction. Continue permitted independent work or finish from existing evidence. Skip unavailable optional information using the null or unknown value allowed by the output schema. Do not invent missing facts or discard a valid result because optional research or browser cleanup failed. Report failure only when a required outcome cannot be completed with verified evidence.',
                    'Call report_progress before starting work and before each distinct check. Report steps within a stage, including checks within the same browser session. Select the closest allowed message for work you are actually doing. Do not batch all checks under one update or repeat a message for each tool call. Use this tool for all visible progress. Return the final result using the output schema.',
                    ...(session.captures
                        ? [
                              `Here capture_job_description takes page text in place of a CSS selector. First call ${pageTextTool} on the task-owned tab. Then call capture_job_description with that tab ID, start set to the first 8 to 12 words of the description, and end set to its last 8 to 12 words. Copy both exactly from the page text. The bridge copies everything from start through end and returns descriptionCaptureId and sourceUrl. Keep page navigation and the application form outside that range.`,
                              'Report each applicable import checkpoint as you reach it. Include applicant context, role verification, description capture, and requirements. Include experience, skills, resume comparison, location, salary, live status, application route, and final preparation.',
                          ]
                        : []),
                ]
                    .filter(Boolean)
                    .join('\n\n'),
                tools: [...localTools, ...(input.webSearch === false ? [] : webTools)],
                allowedTools: [
                    ...webTools,
                    `mcp__${bridgeServer}__report_progress`,
                    `mcp__${bridgeServer}__capture_job_description`,
                ],
                mcpServers: {
                    [bridgeServer]: createSdkMcpServer({
                        name: bridgeServer,
                        tools: session.captures ? [report, this.captureTool(session)] : [report],
                    }),
                },
                outputFormat: {
                    type: 'json_schema',
                    schema: session.captures
                        ? createJobPostImportAgentOutputSchema()
                        : input.outputSchema,
                },
                canUseTool: this.permissionCheck(threadId, session),
                ...(session.captures
                    ? {
                          hooks: {
                              PostToolUse: [
                                  { matcher: pageTextTool, hooks: [this.keepPageText(session)] },
                              ],
                          },
                      }
                    : {}),
            },
        })

        this.sessions.set(threadId, session)
        session.done = this.consume(threadId, session, stream)

        return { threadId, turnId }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        const session = this.sessions.get(threadId)
        if (session?.turnId !== turnId) return

        session.abort.abort()
        await session.done
        await this.tabCleanups.get(threadId)
    }

    resolvePermission(permissionId: string, decision: AgentPermissionDecision): boolean {
        const pending = this.pendingPermissions.get(permissionId)
        if (pending === undefined) return false
        if (pending.decision !== null) return pending.decision === decision

        pending.decision = decision
        pending.resolve(decision)
        return true
    }

    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    async shutdown(): Promise<void> {
        await Promise.allSettled(
            [...this.sessions].map(([threadId, { turnId }]) =>
                this.interruptTask(threadId, turnId),
            ),
        )
        this.ready = false
        this.runtimeError = new Error('Agent runtime has stopped')
    }

    private baseOptions(chrome: boolean): Options {
        return {
            cwd: this.cwd,
            // Personal and project instruction files do not apply to bridge tasks.
            settingSources: [],
            settings: { disableClaudeAiConnectors: true },
            extraArgs: chrome ? { chrome: null } : { 'no-chrome': null },
        }
    }

    private permissionCheck(threadId: string, session: Session): CanUseTool {
        return async (toolName, toolInput, { signal, decisionReason }) => {
            if (!session.chrome || !toolName.startsWith(chromeTools)) {
                return { behavior: 'deny', message: 'This tool is not available for this task.' }
            }

            for (const origin of chromeOrigins(toolInput, decisionReason)) {
                if (!(await this.requestOrigin(threadId, session, origin, signal))) {
                    return {
                        behavior: 'deny',
                        message: `The user declined Chrome access to ${origin}.`,
                    }
                }
            }

            return { behavior: 'allow', updatedInput: toolInput }
        }
    }

    /** Asks the user once for each origin. Requests for one task wait their turn. */
    private requestOrigin(
        threadId: string,
        session: Session,
        origin: string,
        signal: AbortSignal,
    ): Promise<boolean> {
        const request = session.permissions.then(async () => {
            const approved = this.approvedOrigins.get(threadId) ?? new Set<string>()
            this.approvedOrigins.set(threadId, approved)
            if (approved.has(origin)) return true
            if (signal.aborted) return false

            const id = randomUUID()
            const decision = await new Promise<AgentPermissionDecision>((resolve) => {
                this.pendingPermissions.set(id, { decision: null, resolve })
                signal.addEventListener('abort', () => resolve('decline'), { once: true })
                session.abort.signal.addEventListener('abort', () => resolve('decline'), {
                    once: true,
                })
                this.queueEvent({
                    type: 'permission-required',
                    permission: {
                        id,
                        kind: 'browser-origin',
                        threadId,
                        turnId: session.turnId,
                        message: `Allow Chrome to access ${origin}?`,
                        origin,
                    },
                })
            })
            this.pendingPermissions.delete(id)
            this.queueEvent({ type: 'permission-resolved', threadId, permissionId: id })
            if (decision === 'approve') approved.add(origin)

            return decision === 'approve'
        })
        session.permissions = request.catch(() => false)

        return request
    }

    /** Keeps the page text that Chrome returned, so a capture can copy from it. */
    private keepPageText(session: Session): HookCallback {
        return (input) => {
            if (input.hook_event_name === 'PostToolUse' && isObject(input.tool_input)) {
                const first: unknown = Array.isArray(input.tool_response)
                    ? input.tool_response[0]
                    : null
                const page = pageTextResult.exec(
                    isObject(first) && typeof first.text === 'string' ? first.text : '',
                )
                if (page) {
                    session.pages.set(String(input.tool_input.tabId), {
                        sourceUrl: page[1]!,
                        text: page[2]!,
                    })
                }
            }

            return Promise.resolve({})
        }
    }

    /** Copies the description from kept page text. The model supplies only where it starts and ends. */
    private captureTool(session: Session) {
        const fail = (text: string) => ({
            content: [{ type: 'text' as const, text }],
            isError: true,
        })

        return tool(
            'capture_job_description',
            `Copy the complete job description from page text into the import. Call ${pageTextTool} on the tab first. Returns descriptionCaptureId and sourceUrl; use these in the final post. Do not reproduce the description in the final output.`,
            captureInput,
            ({ tabId, start, end }) => {
                const page = session.pages.get(String(tabId))
                if (page === undefined) {
                    return Promise.resolve(fail(`Call ${pageTextTool} on this tab first.`))
                }

                const capture = copyDescription(page, start, end)
                if (capture === undefined) {
                    return Promise.resolve(
                        fail('Copy start and end exactly from the page text, then retry.'),
                    )
                }

                const descriptionCaptureId = randomUUID()
                session.captures?.set(descriptionCaptureId, capture)
                return Promise.resolve({
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({
                                descriptionCaptureId,
                                sourceUrl: capture.sourceUrl,
                                characters: capture.description.length,
                            }),
                        },
                    ],
                })
            },
        )
    }

    private async consume(
        threadId: string,
        session: Session,
        stream: AsyncIterable<SDKMessage>,
    ): Promise<void> {
        const { turnId } = session
        let completed = false
        let error = 'Agent task ended without a result'

        try {
            for await (const message of stream) {
                if (message.type === 'assistant') {
                    for (const block of message.message.content) {
                        if (block.type === 'tool_use')
                            this.reportActivity(threadId, turnId, block.name)
                    }
                } else if (message.type === 'system' && message.subtype === 'api_retry') {
                    this.queueEvent({ type: 'retrying', threadId, turnId, text: 'Retrying' })
                } else if (message.type === 'result') {
                    if (message.subtype !== 'success') {
                        error = message.errors.join(' ') || 'Agent task did not complete'
                    } else if (message.is_error) {
                        error = message.result || 'Agent task did not complete'
                    } else {
                        completed = true
                        this.queueEvent({
                            type: 'final-message',
                            threadId,
                            turnId,
                            text: this.finalText(
                                session,
                                message.structured_output,
                                message.result,
                            ),
                        })
                    }
                }
            }
        } catch (streamError) {
            if (streamError instanceof Error) error = streamError.message
        }

        this.sessions.delete(threadId)
        const interrupted = session.abort.signal.aborted
        this.queueEvent({
            type: 'turn-completed',
            threadId,
            turnId,
            status: interrupted ? 'interrupted' : completed ? 'completed' : 'failed',
            error: interrupted || completed ? null : error,
        })
        // A finished task closes its own tabs. A stopped task cannot.
        if (session.chrome && !completed) this.closeTabs(threadId, turnId)
    }

    private finalText(session: Session, output: unknown, fallback: string): string {
        const text = output === undefined ? fallback : JSON.stringify(output)
        if (session.captures === null) return text

        try {
            return completeJobPostImport(text, session.captures)
        } catch (error) {
            return JSON.stringify({
                result: {
                    error:
                        error instanceof Error
                            ? error.message.slice(0, 500)
                            : 'Could not complete the job-description capture. Try again.',
                },
            })
        }
    }

    private reportActivity(threadId: string, turnId: string, toolName: string): void {
        const activity = webTools.includes(toolName)
            ? 'web-search'
            : localTools.includes(toolName)
              ? 'local-read'
              : toolName.startsWith(chromeTools)
                ? 'tool-use'
                : null

        if (activity !== null) this.queueEvent({ type: 'activity', threadId, turnId, activity })
    }

    /** Continues a copy of the stopped conversation only to close its browser tabs. */
    private closeTabs(threadId: string, turnId: string): void {
        const cleanup = (async () => {
            const stream = this.query({
                prompt: 'The task was stopped. Close every browser tab that this task created. Do not close any other tab. Do nothing else.',
                options: {
                    ...this.baseOptions(true),
                    resume: threadId,
                    forkSession: true,
                    persistSession: false,
                    model: 'haiku',
                    tools: [],
                    allowedTools: [
                        `${chromeTools}tabs_context_mcp`,
                        `${chromeTools}tabs_close_mcp`,
                    ],
                    maxTurns: 8,
                },
            })
            for await (const message of stream) {
                if (message.type === 'result' && message.subtype !== 'success') {
                    throw new Error('Browser tabs could not be closed')
                }
            }
        })()
            .catch(() =>
                this.queueEvent({
                    type: 'commentary',
                    threadId,
                    turnId,
                    text: 'Browser tabs could not be closed',
                }),
            )
            .finally(() => this.tabCleanups.delete(threadId))

        this.tabCleanups.set(threadId, cleanup)
    }

    private queueEvent(event: AgentRuntimeEvent): void {
        this.queuedEvents.push(event)
        if (this.eventFlushScheduled) return

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

    private assertReady(): void {
        if (!this.ready) throw this.runtimeError
    }
}
