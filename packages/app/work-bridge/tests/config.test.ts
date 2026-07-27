import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalWorkCwd = process.env.WORK_CWD

afterEach(() => {
    vi.resetModules()

    if (originalWorkCwd === undefined) {
        delete process.env.WORK_CWD
    } else {
        process.env.WORK_CWD = originalWorkCwd
    }
})

describe('Work bridge config', () => {
    it('defaults task context to the repository root', async () => {
        delete process.env.WORK_CWD
        const { env } = await import('../src/config.ts')
        const repositoryRoot = dirname(
            fileURLToPath(new URL('../../../../package.json', import.meta.url)),
        )

        expect(env.WORK_CWD).toBe(repositoryRoot)
    })
})
