import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
    agentSettingsSchema,
    type AgentModelSelection,
    type AgentSettings,
} from '@job-search-facilitator/core'
import { z } from 'zod'

const fileSchema = agentSettingsSchema.extend({
    // The Claude desktop app keeps no model for a task, so the bridge keeps it.
    claudeTaskModels: z
        .record(z.string(), agentSettingsSchema.shape.models.shape.claude)
        .default({}),
})

const defaultSettings: AgentSettings = {
    provider: 'codex',
    models: {
        codex: { model: 'gpt-6-astra', reasoningEffort: 'xhigh' },
        claude: { model: 'claude-opus-5-5', reasoningEffort: 'high' },
    },
}

/** Keeps the chosen Agent provider, model, and reasoning effort in one local file. */
export class AgentSettingsStore {
    current: AgentSettings
    private claudeTaskModels: Record<string, AgentModelSelection>

    constructor(private readonly file: string) {
        let saved: unknown
        try {
            saved = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
            // A missing or unreadable file means no choice was saved.
        }
        const { claudeTaskModels, ...settings } = fileSchema.safeParse(saved).data ?? {
            ...defaultSettings,
            claudeTaskModels: {},
        }
        this.current = settings
        this.claudeTaskModels = claudeTaskModels
    }

    save(settings: AgentSettings): void {
        this.write(settings, this.claudeTaskModels)
    }

    claudeTaskModel(taskId: string): AgentModelSelection | null {
        return this.claudeTaskModels[taskId] ?? null
    }

    saveClaudeTaskModel(taskId: string, model: AgentModelSelection): void {
        this.write(this.current, { ...this.claudeTaskModels, [taskId]: model })
    }

    private write(
        settings: AgentSettings,
        claudeTaskModels: Record<string, AgentModelSelection>,
    ): void {
        const temporary = `${this.file}.${process.pid}.tmp`
        mkdirSync(dirname(this.file), { recursive: true })
        writeFileSync(temporary, `${JSON.stringify({ ...settings, claudeTaskModels }, null, 4)}\n`)
        renameSync(temporary, this.file)
        this.current = settings
        this.claudeTaskModels = claudeTaskModels
    }
}
