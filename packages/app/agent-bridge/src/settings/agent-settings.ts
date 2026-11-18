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
    // The plugin switches that the user changed. Every other plugin keeps its default.
    plugins: z.record(z.string(), z.boolean()).default({}),
})

type SettingsFile = z.infer<typeof fileSchema>

const defaultSettings: SettingsFile = {
    provider: 'codex',
    models: {
        codex: { model: 'gpt-6-astra', reasoningEffort: 'xhigh' },
        claude: { model: 'claude-opus-5-5', reasoningEffort: 'high' },
    },
    claudeTaskModels: {},
    plugins: {},
}

/** Keeps the Agent choices that the user makes in Settings in one local file. */
export class AgentSettingsStore {
    private saved: SettingsFile

    constructor(private readonly file: string) {
        let content: unknown
        try {
            content = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
            // A missing or unreadable file means no choice was saved.
        }
        this.saved = fileSchema.safeParse(content).data ?? defaultSettings
    }

    /** The selected provider, with the model and reasoning effort of each provider. */
    get current(): AgentSettings {
        return { provider: this.saved.provider, models: this.saved.models }
    }

    save(settings: AgentSettings): void {
        this.write({ ...this.saved, ...settings })
    }

    claudeTaskModel(taskId: string): AgentModelSelection | null {
        return this.saved.claudeTaskModels[taskId] ?? null
    }

    saveClaudeTaskModel(taskId: string, model: AgentModelSelection): void {
        this.write({
            ...this.saved,
            claudeTaskModels: { ...this.saved.claudeTaskModels, [taskId]: model },
        })
    }

    /** Returns undefined when the user did not change the switch of this plugin. */
    pluginEnabled(pluginId: string): boolean | undefined {
        return this.saved.plugins[pluginId]
    }

    savePluginEnabled(pluginId: string, enabled: boolean): void {
        this.write({ ...this.saved, plugins: { ...this.saved.plugins, [pluginId]: enabled } })
    }

    private write(next: SettingsFile): void {
        const temporary = `${this.file}.${process.pid}.tmp`
        mkdirSync(dirname(this.file), { recursive: true })
        writeFileSync(temporary, `${JSON.stringify(next, null, 4)}\n`)
        renameSync(temporary, this.file)
        this.saved = next
    }
}
