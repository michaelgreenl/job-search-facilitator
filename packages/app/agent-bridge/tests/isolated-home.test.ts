import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'smol-toml'
import { prepareAgentHome } from '../src/runtime/codex/isolated-home.ts'

it('shares sign-in without copying personal instructions or past sessions', () => {
    const source = mkdtempSync(join(tmpdir(), 'agent-source-'))
    const destination = mkdtempSync(join(tmpdir(), 'agent-home-'))

    try {
        writeFileSync(join(source, 'auth.json'), 'test-sign-in')
        writeFileSync(join(source, 'AGENTS.md'), 'Personal instructions')
        writeFileSync(
            join(source, 'config.toml'),
            `
developer_instructions = "Personal instructions"
[mcp_servers.node_repl]
command = "/browser/runtime"
[mcp_servers.unrelated]
command = "/personal/runtime"
[skills]
include_instructions = true
[hooks]
SessionStart = []
`,
        )
        const environment = prepareAgentHome(destination, source)

        expect(environment.CODEX_HOME).toBe(destination)
        expect(readdirSync(destination).sort()).toEqual(['auth.json', 'config.toml'])
        const config = parse(readFileSync(join(destination, 'config.toml'), 'utf8'))
        expect(config.mcp_servers).toEqual({
            node_repl: { command: '/browser/runtime', required: true },
        })
        expect(config).not.toHaveProperty('developer_instructions')
        expect(config).not.toHaveProperty('hooks')
        writeFileSync(join(destination, 'auth.json'), 'runtime-refresh')
        expect(readFileSync(join(source, 'auth.json'), 'utf8')).toBe('test-sign-in')
        writeFileSync(join(source, 'auth.json'), 'refreshed-sign-in')
        prepareAgentHome(destination, source)
        expect(readFileSync(join(destination, 'auth.json'), 'utf8')).toBe('refreshed-sign-in')
        expect(() => prepareAgentHome(source, source)).toThrow('separate Codex home')
        expect(() => prepareAgentHome(destination, source)).not.toThrow()
    } finally {
        rmSync(destination, { recursive: true, force: true })
        rmSync(source, { recursive: true, force: true })
    }
})
