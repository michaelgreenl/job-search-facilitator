import type { AppServerConnection } from './app-server-connection.ts'
import { emptyResponseSchema } from './protocol.ts'

/** Starts the app-server process and completes the protocol handshake. */
export async function startAppServer(connection: AppServerConnection): Promise<void> {
    connection.start()
    await connection.request(
        'initialize',
        {
            clientInfo: { name: 'job-search-facilitator', version: '0.1.0' },
            capabilities: { experimentalApi: true, mcpServerOpenaiFormElicitation: true },
        },
        emptyResponseSchema,
    )
    connection.notify('initialized')
}
