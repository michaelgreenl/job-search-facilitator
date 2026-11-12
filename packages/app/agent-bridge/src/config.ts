import 'dotenv/config'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bundledCodex = '/Applications/ChatGPT.app/Contents/Resources/codex'
// Where the Claude desktop app keeps its data on this operating system.
const claudeAppData =
    process.platform === 'darwin'
        ? join(homedir(), 'Library/Application Support/Claude')
        : process.platform === 'win32'
          ? join(process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'), 'Claude')
          : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claude')
const repositoryRoot = dirname(fileURLToPath(new URL('../../../../package.json', import.meta.url)))

export const env = {
    PORT: Number(process.env.PORT ?? 3001),
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    CODEX_BIN: process.env.CODEX_BIN ?? (existsSync(bundledCodex) ? bundledCodex : 'codex'),
    AGENT_CWD: process.env.AGENT_CWD ?? repositoryRoot,
    AGENT_CODEX_HOME: process.env.AGENT_CODEX_HOME ?? join(repositoryRoot, '.local/agent-codex'),
    CLAUDE_APP_DATA: process.env.CLAUDE_APP_DATA ?? claudeAppData,
    AGENT_SETTINGS_FILE:
        process.env.AGENT_SETTINGS_FILE ?? join(repositoryRoot, '.local/agent-settings.json'),
}
