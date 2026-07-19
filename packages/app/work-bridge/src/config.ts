import 'dotenv/config'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const bundledCodex = '/Applications/ChatGPT.app/Contents/Resources/codex'
const repositoryRoot = dirname(fileURLToPath(new URL('../../../../package.json', import.meta.url)))

export const env = {
    PORT: Number(process.env.PORT ?? 3001),
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    CODEX_BIN: process.env.CODEX_BIN ?? (existsSync(bundledCodex) ? bundledCodex : 'codex'),
    WORK_CWD: process.env.WORK_CWD ?? repositoryRoot,
}
