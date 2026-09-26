import {
    chmodSync,
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readlinkSync,
    realpathSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'

export const personalCodexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
export const chromeRoot = join(
    personalCodexHome,
    '.tmp/bundled-marketplaces/openai-bundled/plugins/chrome',
)

const sharedSettingsSchema = z.object({
    model: z.string().optional(),
    model_reasoning_effort: z.string().optional(),
    mcp_servers: z.object({ node_repl: z.record(z.string(), z.unknown()).optional() }).optional(),
})

export function prepareAgentHome(directory: string, source = personalCodexHome) {
    const destination = resolve(directory)

    if (destination === resolve(source)) {
        throw new Error('Agent runtime requires a separate Codex home')
    }

    mkdirSync(destination, { recursive: true, mode: 0o700 })
    if (realpathSync(destination) === realpathSync(source)) {
        throw new Error('Agent runtime requires a separate Codex home')
    }

    const browserPlugin = join(source, '.tmp/bundled-marketplaces/openai-bundled/plugins/chrome')
    const skillLink = join(destination, 'skills/chrome')
    if (existsSync(browserPlugin) && !existsSync(skillLink)) {
        mkdirSync(join(destination, 'skills'), { recursive: true, mode: 0o700 })
        symlinkSync(browserPlugin, skillLink)
    }

    // Refresh sign-in at startup. Runtime writes stay in this home.
    for (const name of ['auth.json', 'models_cache.json']) {
        const target = resolve(source, name)
        const link = join(destination, name)

        if (!existsSync(target)) {
            continue
        }

        if (existsSync(link) && lstatSync(link).isSymbolicLink()) {
            if (readlinkSync(link) !== target) {
                throw new Error(`Agent runtime has an unexpected ${name} link`)
            }
            unlinkSync(link)
        }
        copyFileSync(target, link)
        chmodSync(link, 0o600)
    }

    const settingsFile = join(source, 'config.toml')
    const settings = sharedSettingsSchema.parse(
        existsSync(settingsFile) ? parse(readFileSync(settingsFile, 'utf8')) : {},
    )
    const config = {
        ...settings,
        mcp_servers:
            settings.mcp_servers?.node_repl === undefined
                ? {}
                : {
                      node_repl: { ...settings.mcp_servers.node_repl, required: true },
                  },
        project_doc_max_bytes: 0,
        skills: { include_instructions: false, bundled: { enabled: false } },
        features: { memories: false, chronicle: false },
        apps: { _default: { enabled: false } },
    }
    writeFileSync(join(destination, 'config.toml'), stringify(config), { mode: 0o600 })
    const environment: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: destination }
    delete environment.CODEX_THREAD_ID
    delete environment.CODEX_SESSION_ID
    delete environment.CODEX_INTERNAL_ORIGINATOR_OVERRIDE
    return environment
}
