import { createServer } from 'node:http'
import { join } from 'node:path'
import { env } from './config.ts'
import { createApp } from './http/app.ts'
import { ClaudeRuntime } from './runtime/claude/claude-runtime.ts'
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
const providers = new ProviderRouter(
    { codex, claude },
    () => settings.current.provider,
    async (threadId) => ((await claude.ownsThread(threadId)) ? 'claude' : 'codex'),
)
let server: ReturnType<typeof createServer> | null = null
let shuttingDown = false

const close = () => {
    shuttingDown = true
    server?.close()
    server?.closeAllConnections()
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
            { directory: join(personalCodexHome, 'automations'), projectRoot: env.AGENT_CWD },
            { store: settings, providers },
        ),
    )
    server.listen(env.PORT, '127.0.0.1')
}
