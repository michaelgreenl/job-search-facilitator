import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import type { ZodType } from 'zod'
import { isObject, rpcErrorSchema, rpcIdSchema, type RpcId } from './protocol.ts'

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

export type SpawnAppServerProcess = (
    command: string,
    args: string[],
    options: { cwd: string; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams

export interface AppServerConnectionHandlers {
    onNotification: (method: string, params: unknown) => void
    onRequest: (id: RpcId, method: string, params: unknown) => void
    onUnavailable: (error: Error) => void
    onFailure: (error: Error) => void
}

export interface AppServerConnectionOptions {
    spawnProcess?: SpawnAppServerProcess
    requestTimeoutMs?: number
    exitDrainTimeoutMs?: number
    diagnosticSink?: (message: string) => void
    diagnosticBufferSize?: number
}

export class AppServerConnection {
    private process: ChildProcessWithoutNullStreams | null = null
    private output: Interface | null = null
    private requestId = 0
    private readonly pendingRequests = new Map<RpcId, PendingRequest>()
    private readonly spawnProcess: SpawnAppServerProcess
    private readonly requestTimeoutMs: number
    private readonly exitDrainTimeoutMs: number
    private readonly diagnosticSink: (message: string) => void
    private readonly diagnosticBufferSize: number
    private stderrTail = ''
    private diagnosticPending = false
    private processExitError: Error | null = null
    private exitDrainTimeout: ReturnType<typeof setTimeout> | null = null

    constructor(
        private readonly binary: string,
        private readonly cwd: string,
        private readonly handlers: AppServerConnectionHandlers,
        {
            spawnProcess = spawn,
            requestTimeoutMs = 15_000,
            exitDrainTimeoutMs = 1_000,
            diagnosticSink = console.error,
            diagnosticBufferSize = 4_096,
        }: AppServerConnectionOptions = {},
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

    get running(): boolean {
        return this.process !== null && this.processExitError === null
    }

    get active(): boolean {
        return this.process !== null
    }

    start(): void {
        if (this.process !== null) {
            throw new Error('Agent runtime is already running')
        }

        this.stderrTail = ''
        this.diagnosticPending = false
        this.processExitError = null
        this.clearExitDrainTimeout()
        const child = this.spawnProcess(this.binary, ['app-server', '--stdio'], {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        })

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
    }

    request<T>(method: string, params: unknown, resultSchema: ZodType<T>): Promise<T> {
        const id = ++this.requestId

        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.pendingRequests.has(id)) {
                    return
                }

                this.fail(
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

    notify(method: string, params?: unknown): void {
        this.send(params === undefined ? { method } : { method, params })
    }

    respond(id: RpcId, result: unknown): void {
        this.send({ id, result })
    }

    respondWithError(id: RpcId, code: number, message: string): void {
        this.send({ id, error: { code, message } })
    }

    fail(error: Error): void {
        this.handleExit(error)
    }

    close(): Error | null {
        const child = this.process

        if (child === null) {
            return null
        }

        this.process = null
        this.output?.close()
        this.output = null
        this.diagnosticPending = false
        this.clearExitDrainTimeout()
        const error = this.processExitError ?? new Error('Agent runtime closed')
        this.processExitError = null
        child.kill()
        this.rejectPending(error)

        return error
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
            this.fail(new Error('Agent runtime returned malformed JSON'))
            return
        }

        if (!isObject(message)) {
            this.fail(new Error('Agent runtime returned an invalid JSON-RPC message'))
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
                this.fail(new Error('Agent runtime returned an invalid JSON-RPC message'))
                return
            }

            if (!hasId) {
                this.handlers.onNotification(message.method, message.params)
                return
            }

            const id = rpcIdSchema.safeParse(message.id)

            if (!id.success) {
                this.fail(new Error('Agent runtime returned an invalid JSON-RPC message'))
                return
            }

            this.handlers.onRequest(id.data, message.method, message.params)
            return
        }

        if (!hasId) {
            this.fail(new Error('Agent runtime returned an invalid JSON-RPC message'))
            return
        }

        const id = rpcIdSchema.safeParse(message.id)

        if (!id.success || hasResult === hasError) {
            this.fail(new Error('Agent runtime returned an invalid JSON-RPC response'))
            return
        }

        const pending = this.pendingRequests.get(id.data)

        if (pending === undefined) {
            return
        }

        if (hasError) {
            const rpcError = rpcErrorSchema.safeParse(message.error)

            if (!rpcError.success) {
                this.fail(new Error('Agent runtime returned an invalid JSON-RPC response'))
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
            this.fail(new Error(`Agent runtime returned invalid response for "${pending.method}"`))
            return
        }

        this.pendingRequests.delete(id.data)
        clearTimeout(pending.timeout)
    }

    private handleProcessExit(child: ChildProcessWithoutNullStreams, error: Error): void {
        if (this.process !== child) {
            return
        }

        this.handlers.onUnavailable(error)
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

        this.rejectPending(error)
        this.handlers.onUnavailable(error)
        this.handlers.onFailure(error)
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
