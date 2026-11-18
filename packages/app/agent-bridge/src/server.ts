import { createServer } from 'node:http'
import { join } from 'node:path'
import { AutomationRuns } from './automations/automation-runs.ts'
import { env } from './config.ts'
import { createApp } from './http/app.ts'
import { AgentPlugins } from './plugins/agent-plugins.ts'
import { createClaudeAutomationRunner } from './runtime/claude/claude-automation.ts'
import { ClaudeRuntime } from './runtime/claude/claude-runtime.ts'
import { createCodexAutomationRunner } from './runtime/codex/codex-automation.ts'
import { createCodexPluginReader } from './runtime/codex/codex-plugins.ts'
import { CodexRuntime } from './runtime/codex/codex-runtime.ts'
import { chromeRoot, personalCodexHome, prepareAgentHome } from './runtime/codex/isolated-home.ts'
import { ProviderRouter } from './runtime/provider-router.ts'
import { AgentSettingsStore } from './settings/agent-settings.ts'
import { AgentTaskManager } from './tasks/agent-task-manager.ts'

const settings = new AgentSettingsStore(env.AGENT_SETTINGS_FILE)
const codex = new CodexRuntime(env.CODEX_BIN, env.AGENT_CWD, {
    environment: prepareAgentHome(env.AGENT_CODEX_HOME),
    chromeRoot,
    personalCodexHome,
    selection: () => settings.current.models.codex,
})
const claude = new ClaudeRuntime(env.AGENT_CWD, {
    selection: () => settings.current.models.claude,
})
const plugins = new AgentPlugins(settings, {
    codex: createCodexPluginReader(env.CODEX_BIN, env.AGENT_CWD),
    claude: () => claude.readPlugins(),
})
const providers = new ProviderRouter(
    { codex, claude },
    () => settings.current.provider,
    async (threadId) => ((await claude.ownsThread(threadId)) ? 'claude' : 'codex'),
    (provider, capability) => plugins.allows(provider, capability),
)
const runs = new AutomationRuns(
    {
        codex: createCodexAutomationRunner(env.CODEX_BIN, chromeRoot),
        claude: createClaudeAutomationRunner((names) => claude.connectorServers(names)),
    },
    (provider) => plugins.switches(provider),
)
let server: ReturnType<typeof createServer> | null = null
let shuttingDown = false

const close = () => {
    shuttingDown = true
    server?.close()
    server?.closeAllConnections()
    runs.cancelAll()
    void codex.shutdown()
    void claude.shutdown()
}

process.once('SIGINT', close)
process.once('SIGTERM', close)

// A provider that cannot start reports the reason through its health.
await Promise.allSettled([codex.start(), claude.start()])

if (!shuttingDown) {
    server = createServer(
        createApp(
            new AgentTaskManager(providers),
            env.CLIENT_ORIGIN,
            {
                directory: join(personalCodexHome, 'automations'),
                projectRoot: env.AGENT_CWD,
                claude: { appData: env.CLAUDE_APP_DATA, settings },
                runs,
            },
            { store: settings, providers },
            plugins,
        ),
    )
    server.listen(env.PORT, '127.0.0.1')
    // Read the plugin states now, so that Settings shows them without a wait.
    void plugins.list()
}
