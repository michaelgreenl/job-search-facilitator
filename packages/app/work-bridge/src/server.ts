import { createServer } from 'node:http'
import { createApp } from './app.ts'
import { CodexAppServer } from './app-server.ts'
import { env } from './config.ts'
import { WorkTaskManager } from './task-manager.ts'

const runtime = new CodexAppServer(env.CODEX_BIN, env.WORK_CWD)
await runtime.start()

const server = createServer(
    createApp(new WorkTaskManager(runtime), runtime.capabilities, env.CLIENT_ORIGIN),
)

server.listen(env.PORT, '127.0.0.1')

const close = () => {
    runtime.close()
    server.close()
    server.closeAllConnections()
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
