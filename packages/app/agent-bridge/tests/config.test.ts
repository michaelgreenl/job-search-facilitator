import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalAgentCwd = process.env.AGENT_CWD

afterEach(() => {
    vi.resetModules()

    if (originalAgentCwd === undefined) {
        delete process.env.AGENT_CWD
    } else {
        process.env.AGENT_CWD = originalAgentCwd
    }
})

describe('Agent bridge config', () => {
    it('defaults task context to the repository root', async () => {
        delete process.env.AGENT_CWD
        const { env } = await import('../src/config.ts')
        const repositoryRoot = dirname(
            fileURLToPath(new URL('../../../../package.json', import.meta.url)),
        )

        expect(env.AGENT_CWD).toBe(repositoryRoot)
    })
})
