import { z } from 'zod'
import { agentProviderSchema } from './agent-settings.ts'
import { createParser, nonBlankStringSchema } from './shared.ts'

export const AGENT_PLUGIN_KINDS = ['browser', 'documents', 'mail'] as const

const agentPluginSchema = z.object({
    id: nonBlankStringSchema,
    provider: agentProviderSchema,
    kind: z.enum(AGENT_PLUGIN_KINDS),
    name: nonBlankStringSchema,
    /** `ready` means that the provider can use the plugin now. */
    status: z.enum(['ready', 'needs-sign-in', 'not-installed', 'unavailable']),
    /** The user's choice. Agents use a plugin that is ready and enabled. */
    enabled: z.boolean(),
})

export const updateAgentPluginSchema = z.strictObject({ enabled: z.boolean() })

export type AgentPlugin = z.infer<typeof agentPluginSchema>
export type AgentPluginKind = AgentPlugin['kind']
export type AgentPluginStatus = AgentPlugin['status']
export const parseAgentPlugin = createParser('Agent plugin', agentPluginSchema)
export const parseAgentPlugins = createParser('Agent plugins', z.array(agentPluginSchema))
