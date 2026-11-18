import type {
    AgentCapability,
    AgentPlugin,
    AgentPluginKind,
    AgentPluginStatus,
    AgentProvider,
} from '@job-search-facilitator/core'
import type { AgentSettingsStore } from '../settings/agent-settings.ts'

interface PluginDefinition {
    id: string
    provider: AgentProvider
    kind: AgentPluginKind
    name: string
    /** The name that the provider itself uses for the plugin. */
    source: string
}

/** The provider plugins that the agents of this app can use. */
const definitions: PluginDefinition[] = [
    {
        id: 'codex-chrome',
        provider: 'codex',
        kind: 'browser',
        name: 'Chrome',
        source: 'chrome@openai-bundled',
    },
    {
        id: 'claude-chrome',
        provider: 'claude',
        kind: 'browser',
        name: 'Claude in Chrome',
        source: 'claude-in-chrome',
    },
    {
        id: 'codex-documents',
        provider: 'codex',
        kind: 'documents',
        name: 'Documents',
        source: 'documents@openai-primary-runtime',
    },
    {
        id: 'claude-google-docs',
        provider: 'claude',
        kind: 'documents',
        name: 'Google Docs',
        source: 'claude.ai Google Docs',
    },
    {
        id: 'claude-docs',
        provider: 'claude',
        kind: 'documents',
        name: 'Claude Docs',
        source: 'claude.ai Claude Docs',
    },
    {
        id: 'codex-gmail',
        provider: 'codex',
        kind: 'mail',
        name: 'Gmail',
        source: 'gmail@openai-curated-remote',
    },
    {
        id: 'claude-gmail',
        provider: 'claude',
        kind: 'mail',
        name: 'Gmail',
        source: 'claude.ai Gmail',
    },
]

/** The plugin that gives each provider a task capability. */
const capabilityPlugins: Record<AgentCapability, Record<AgentProvider, string>> = {
    chrome: { codex: 'codex-chrome', claude: 'claude-chrome' },
}

/** One plugin of a provider, by the provider's own name, and the user's choice for it. */
export interface PluginSwitch {
    source: string
    enabled: boolean
}

/** Reads the state of a provider's plugins, keyed by the provider's own plugin names. */
export type PluginStatusReader = () => Promise<Map<string, AgentPluginStatus>>

type ProviderStatuses = Record<AgentProvider, Map<string, AgentPluginStatus> | null>

/**
 * Lists the plugins that agents can use and keeps the user's switch for each.
 * A browser plugin starts on. Every other plugin starts off.
 */
export class AgentPlugins {
    private statuses: Promise<ProviderStatuses> | null = null

    constructor(
        private readonly store: AgentSettingsStore,
        private readonly readers: Record<AgentProvider, PluginStatusReader>,
    ) {}

    /** Lists each plugin with the provider state from the last read. */
    async list(): Promise<AgentPlugin[]> {
        const statuses = await (this.statuses ??= this.read())

        return definitions.map(({ source, ...plugin }) => {
            const provider = statuses[plugin.provider]
            return {
                ...plugin,
                // A provider that cannot answer has no usable plugin.
                status:
                    provider === null ? 'unavailable' : (provider.get(source) ?? 'not-installed'),
                enabled: this.enabled(plugin),
            }
        })
    }

    /** Reads the provider states again, then lists each plugin. */
    refresh(): Promise<AgentPlugin[]> {
        this.statuses = this.read()
        return this.list()
    }

    /** Returns false when no plugin has this identifier. */
    setEnabled(id: string, enabled: boolean): boolean {
        if (!definitions.some((plugin) => plugin.id === id)) return false

        this.store.savePluginEnabled(id, enabled)
        return true
    }

    /** Reports whether the plugin behind a task capability is on for the provider. */
    allows(provider: AgentProvider, capability: AgentCapability): boolean {
        const id = capabilityPlugins[capability][provider]
        return definitions.some((plugin) => plugin.id === id && this.enabled(plugin))
    }

    /** Lists the user's choice for each plugin of one provider. */
    switches(provider: AgentProvider): PluginSwitch[] {
        return definitions
            .filter((plugin) => plugin.provider === provider)
            .map((plugin) => ({ source: plugin.source, enabled: this.enabled(plugin) }))
    }

    private enabled({ id, kind }: Pick<PluginDefinition, 'id' | 'kind'>): boolean {
        return this.store.pluginEnabled(id) ?? kind === 'browser'
    }

    private async read(): Promise<ProviderStatuses> {
        const [codex, claude] = await Promise.all(
            [this.readers.codex, this.readers.claude].map((reader) => reader().catch(() => null)),
        )
        return { codex: codex ?? null, claude: claude ?? null }
    }
}
