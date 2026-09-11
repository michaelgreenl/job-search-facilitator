import { createServer } from 'node:http'
import { env } from './config.ts'
import { createApp } from './http/app.ts'
import { CodexRuntime } from './runtime/codex/codex-runtime.ts'
import { chromeRoot, prepareAgentHome } from './runtime/codex/isolated-home.ts'
import { AgentTaskManager } from './tasks/agent-task-manager.ts'

const runtime = new CodexRuntime(env.CODEX_BIN, env.AGENT_CWD, {
    environment: prepareAgentHome(env.AGENT_CODEX_HOME),
    chromeRoot,
})
let server: ReturnType<typeof createServer> | null = null
let shuttingDown = false

const close = () => {
    shuttingDown = true
    server?.close()
    server?.closeAllConnections()
    void runtime.shutdown()
}

process.once('SIGINT', close)
process.once('SIGTERM', close)

try {
    await runtime.start()
} catch (error) {
    if (!shuttingDown) {
        throw error
    }
}

if (!shuttingDown) {
    server = createServer(createApp(new AgentTaskManager(runtime), env.CLIENT_ORIGIN))
    server.listen(env.PORT, '127.0.0.1')
}
