import { existsSync } from 'node:fs'
import type { AutomationRunner } from '../../automations/automation-runs.ts'
import { AppServerConnection } from './app-server-connection.ts'
import { closeTaskTabs } from './codex-runtime.ts'
import {
    emptyResponseSchema,
    itemCompletedSchema,
    threadStartResponseSchema,
    turnCompletedSchema,
    turnStartResponseSchema,
} from './protocol.ts'

/**
 * Runs an automation prompt as an unattended Codex thread in the project. The
 * thread uses the personal Codex home, as a scheduled run in the desktop app does.
 */
export const createCodexAutomationRunner =
    (binary: string, chromeRoot: string): AutomationRunner =>
    async ({ prompt, cwd, model, signal, onProgress }) => {
        let threadId: string | null = null
        let turnId: string | null = null
        let finalMessage: string | null = null
        let finish: (error?: Error) => void = () => undefined
        const completion = new Promise<void>((resolve, reject) => {
            finish = (error) => (error ? reject(error) : resolve())
        })
        // A failure can arrive during setup, before the completion promise is awaited.
        void completion.catch(() => undefined)

        const connection = new AppServerConnection(
            binary,
            cwd,
            {
                onNotification(method, params) {
                    if (method === 'item/completed') {
                        const item = itemCompletedSchema.safeParse(params)
                        if (
                            item.success &&
                            item.data.threadId === threadId &&
                            item.data.item.type === 'agentMessage' &&
                            item.data.item.text
                        ) {
                            if (item.data.item.phase === 'final_answer') {
                                finalMessage = item.data.item.text
                            } else {
                                onProgress(item.data.item.text)
                            }
                        }
                    }
                    if (method === 'turn/completed') {
                        const turn = turnCompletedSchema.safeParse(params)
                        if (turn.success && turn.data.threadId === threadId) {
                            finish(
                                turn.data.turn.status === 'completed'
                                    ? undefined
                                    : new Error(
                                          turn.data.turn.error?.message ??
                                              'The automation was interrupted',
                                      ),
                            )
                        }
                    }
                },
                onRequest(id, method) {
                    connection.respondWithError(id, -32601, 'No user is present to approve this')
                    finish(new Error(`The automation needs user attention: ${method}`))
                },
                onUnavailable: (error) => finish(error),
                onFailure: (error) => finish(error),
            },
            { requestTimeoutMs: 130_000 },
        )
        signal.addEventListener('abort', () => finish(new Error('The run was stopped')), {
            once: true,
        })

        try {
            connection.start()
            await connection.request(
                'initialize',
                {
                    clientInfo: { name: 'job-search-facilitator', version: '0.1.0' },
                    capabilities: { experimentalApi: true, mcpServerOpenaiFormElicitation: true },
                },
                emptyResponseSchema,
            )
            connection.notify('initialized')
            const started = await connection.request(
                'thread/start',
                {
                    cwd,
                    model: model?.model,
                    approvalPolicy: 'on-request',
                    approvalsReviewer: 'auto_review',
                    sandbox: 'workspace-write',
                    threadSource: 'job-search-facilitator',
                    config: model ? { model_reasoning_effort: model.reasoningEffort } : {},
                    selectedCapabilityRoots: existsSync(chromeRoot)
                        ? [
                              {
                                  id: 'chrome@openai-bundled',
                                  location: {
                                      type: 'environment',
                                      environmentId: 'workspace',
                                      path: chromeRoot,
                                  },
                              },
                          ]
                        : [],
                },
                threadStartResponseSchema,
            )
            threadId = started.thread.id
            const { turn } = await connection.request(
                'turn/start',
                { threadId, input: [{ type: 'text', text: prompt, text_elements: [] }] },
                turnStartResponseSchema,
            )
            turnId = turn.id
            await completion
            if (finalMessage === null) throw new Error('The automation returned no result')

            return finalMessage
        } catch (error) {
            if (threadId !== null && turnId !== null) {
                await connection
                    .request('turn/interrupt', { threadId, turnId }, emptyResponseSchema)
                    .catch(() => undefined)
            }
            throw error
        } finally {
            if (threadId !== null && turnId !== null) {
                // A run that did not use Chrome has no tabs to close.
                await closeTaskTabs(connection, threadId, turnId).catch(() => undefined)
            }
            connection.close()
        }
    }
