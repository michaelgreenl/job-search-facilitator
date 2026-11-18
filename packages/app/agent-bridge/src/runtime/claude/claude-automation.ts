import {
    query as sdkQuery,
    type EffortLevel,
    type McpClaudeAIProxyServerConfig,
    type McpServerConfig,
} from '@anthropic-ai/claude-agent-sdk'
import type { AutomationRunner } from '../../automations/automation-runs.ts'
import { chromeServer, type QueryFunction } from './claude-runtime.ts'

/** Finds the connection settings of the named connectors on the Claude account. */
type ConnectorServers = (names: string[]) => Promise<Record<string, McpClaudeAIProxyServerConfig>>

/** Runs an automation prompt as an unattended Claude Code session in the project. */
export const createClaudeAutomationRunner =
    (connectors: ConnectorServers, query: QueryFunction = sdkQuery): AutomationRunner =>
    async ({ prompt, cwd, model, plugins, signal, onProgress }) => {
        const abortController = new AbortController()
        signal.addEventListener('abort', () => abortController.abort(), { once: true })
        const enabled = plugins.filter((plugin) => plugin.enabled).map(({ source }) => source)
        const servers = await connectors(enabled.filter((source) => source !== chromeServer))
        let result: string | null = null
        let failure = 'The automation ended without a result'

        const stream = query({
            prompt,
            options: {
                cwd,
                abortController,
                ...(model
                    ? { model: model.model, effort: model.reasoningEffort as EffortLevel }
                    : {}),
                // Personal and project instruction files do not apply to bridge runs.
                settingSources: [],
                // Only the plugins that are on load. Each account connector is named here.
                strictMcpConfig: true,
                // The SDK accepts a connector's own settings. Its option type omits that kind.
                mcpServers: servers as unknown as Record<string, McpServerConfig>,
                systemPrompt: { type: 'preset', preset: 'claude_code' },
                // No user is present. Auto mode reviews each action and blocks a risky one.
                permissionMode: 'auto',
                extraArgs: enabled.includes(chromeServer)
                    ? { chrome: null }
                    : { 'no-chrome': null },
            },
        })

        for await (const message of stream) {
            if (message.type === 'assistant' && message.parent_tool_use_id === null) {
                for (const block of message.message.content) {
                    if (block.type === 'text') onProgress(block.text)
                }
            } else if (message.type === 'result') {
                if (message.subtype !== 'success') {
                    failure = message.errors.join(' ') || failure
                } else if (message.is_error) {
                    failure = message.result || failure
                } else {
                    result = message.result
                }
            }
        }

        if (result === null) throw new Error(failure)
        return result
    }
