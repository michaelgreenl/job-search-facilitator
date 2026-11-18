import type { AgentPluginStatus } from '@job-search-facilitator/core'
import { z } from 'zod'
import type { PluginStatusReader, PluginSwitch } from '../../plugins/agent-plugins.ts'
import { AppServerConnection } from './app-server-connection.ts'
import { startAppServer } from './app-server-session.ts'
import { pluginInstalledResponseSchema } from './protocol.ts'

export const chromePlugin = 'chrome@openai-bundled'

/** The MCP server that a plugin drives. It stays on until it is turned off with its plugin. */
const pluginServers: Record<string, string> = { [chromePlugin]: 'node_repl' }

const pluginAppsSchema = z.object({
    plugin: z.object({ apps: z.array(z.object({ id: z.string().min(1) })) }),
})

type InstalledPlugin = z.infer<
    typeof pluginInstalledResponseSchema
>['marketplaces'][number]['plugins'][number]

/** Lists the plugins that the user's Codex setup has installed for this project. */
export async function readInstalledPlugins(
    connection: AppServerConnection,
    cwd: string,
): Promise<InstalledPlugin[]> {
    const { marketplaces } = await connection.request(
        'plugin/installed',
        { cwds: [cwd] },
        pluginInstalledResponseSchema,
    )
    return marketplaces.flatMap(({ plugins }) => plugins).filter(({ installed }) => installed)
}

/** Reads the identifiers of the apps that a remote plugin works through. */
export async function readPluginApps(
    connection: AppServerConnection,
    pluginId: string,
): Promise<string[]> {
    const [pluginName, remoteMarketplaceName] = pluginId.split('@')
    const { plugin } = await connection.request(
        'plugin/read',
        { pluginName, remoteMarketplaceName },
        pluginAppsSchema,
    )
    return plugin.apps.map(({ id }) => id)
}

/**
 * Builds the thread config that turns off each installed plugin whose switch is off.
 * A plugin whose switch is on keeps the setting from the user's Codex setup.
 */
export async function pluginOverrides(
    installed: InstalledPlugin[],
    switches: PluginSwitch[],
    readApps: (pluginId: string) => Promise<string[]>,
): Promise<Record<string, false>> {
    const overrides: Record<string, false> = {}

    for (const { source, enabled } of switches) {
        const plugin = installed.find(({ id }) => id === source)
        if (enabled || plugin === undefined) continue

        overrides[`plugins.${source}.enabled`] = false
        const server = pluginServers[source]
        if (server !== undefined) overrides[`mcp_servers.${server}.enabled`] = false
        if (plugin.source.type === 'remote') {
            // A remote plugin works through apps. Its tools stay until each app is off.
            for (const app of await readApps(source)) overrides[`apps.${app}.enabled`] = false
        }
    }

    return overrides
}

/** Reads the state of each installed plugin from the user's own Codex setup. */
export const createCodexPluginReader =
    (binary: string, cwd: string): PluginStatusReader =>
    async () => {
        const ignore = () => undefined
        const connection = new AppServerConnection(binary, cwd, {
            onNotification: ignore,
            onRequest: ignore,
            onUnavailable: ignore,
            onFailure: ignore,
        })

        try {
            await startAppServer(connection)
            const plugins = await readInstalledPlugins(connection, cwd)
            return new Map(
                plugins.map(({ id, enabled, availability }): [string, AgentPluginStatus] => [
                    id,
                    enabled && availability === 'AVAILABLE' ? 'ready' : 'unavailable',
                ]),
            )
        } finally {
            connection.close()
        }
    }
