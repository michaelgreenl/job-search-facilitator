import { createServer } from 'node:http'
import { createApp } from './app.ts'
import { CodexAppServer } from './app-server.ts'
import { env } from './config.ts'
import { WorkTaskManager } from './task-manager.ts'

const runtime = new CodexAppServer(env.CODEX_BIN, env.WORK_CWD)
let server: ReturnType<typeof createServer> | null = null
let shuttingDown = false

const close = () => {
    shuttingDown = true
    runtime.close()
    server?.close()
    server?.closeAllConnections()
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
    server = createServer(createApp(new WorkTaskManager(runtime), runtime, env.CLIENT_ORIGIN))
    server.listen(env.PORT, '127.0.0.1')
}
