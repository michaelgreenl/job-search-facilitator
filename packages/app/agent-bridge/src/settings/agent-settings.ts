import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { agentSettingsSchema, type AgentSettings } from '@job-search-facilitator/core'

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

    constructor(private readonly file: string) {
        let saved: unknown
        try {
            saved = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
            // A missing or unreadable file means no choice was saved.
        }
        this.current = agentSettingsSchema.safeParse(saved).data ?? defaultSettings
    }

    save(settings: AgentSettings): void {
        const temporary = `${this.file}.${process.pid}.tmp`
        mkdirSync(dirname(this.file), { recursive: true })
        writeFileSync(temporary, `${JSON.stringify(settings, null, 4)}\n`)
        renameSync(temporary, this.file)
        this.current = settings
    }
}
