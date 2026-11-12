import { z } from 'zod'
import { createParser, nonBlankStringSchema } from './shared.ts'

export const AGENT_PROVIDERS = ['codex', 'claude'] as const

export const agentProviderSchema = z.enum(AGENT_PROVIDERS)

export const agentModelSelectionSchema = z.strictObject({
    model: nonBlankStringSchema,
    reasoningEffort: nonBlankStringSchema,
})

export const agentSettingsSchema = z.strictObject({
    provider: agentProviderSchema,
    models: z.strictObject({
        codex: agentModelSelectionSchema,
        claude: agentModelSelectionSchema,
    }),
})

const agentModelSchema = z.object({
    id: nonBlankStringSchema,
    name: nonBlankStringSchema,
    reasoningEfforts: z.array(nonBlankStringSchema).min(1),
})

const agentProviderStatusSchema = z.object({
    id: agentProviderSchema,
    available: z.boolean(),
    error: z.string().nullable(),
    models: z.array(agentModelSchema),
})

const agentSettingsStateSchema = z.object({
    settings: agentSettingsSchema,
    providers: z.array(agentProviderStatusSchema),
})

export type AgentProvider = z.infer<typeof agentProviderSchema>
export type AgentModelSelection = z.infer<typeof agentModelSelectionSchema>
export type AgentSettings = z.infer<typeof agentSettingsSchema>
export type AgentModel = z.infer<typeof agentModelSchema>
export type AgentProviderStatus = z.infer<typeof agentProviderStatusSchema>
export type AgentSettingsState = z.infer<typeof agentSettingsStateSchema>
export const parseAgentSettingsState = createParser('Agent settings', agentSettingsStateSchema)
