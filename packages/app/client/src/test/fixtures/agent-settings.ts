import type { AgentSettingsState } from '@job-search-facilitator/core'

export const agentSettingsState: AgentSettingsState = {
    settings: {
        provider: 'codex',
        models: {
            codex: { model: 'codex-fast', reasoningEffort: 'ultra' },
            claude: { model: 'claude-large', reasoningEffort: 'high' },
        },
    },
    providers: [
        {
            id: 'codex',
            available: true,
            error: null,
            models: [
                { id: 'codex-fast', name: 'Codex Fast', reasoningEfforts: ['low', 'ultra'] },
                { id: 'codex-deep', name: 'Codex Deep', reasoningEfforts: ['low', 'high'] },
            ],
        },
        {
            id: 'claude',
            available: true,
            error: null,
            models: [{ id: 'claude-large', name: 'Claude Large', reasoningEfforts: ['high'] }],
        },
    ],
}
