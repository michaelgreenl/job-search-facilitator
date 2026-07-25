import { spawn } from 'node:child_process'
import { mkdir, open, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const composeFile = path.join(repositoryRoot, 'packages/app/server/docker-compose.yml')
const backupDirectory = path.join(repositoryRoot, '.local/database-backups')
const timestamp = new Date().toISOString().replaceAll(':', '-')
const backupPath = path.join(backupDirectory, `${timestamp}.dump`)

await mkdir(backupDirectory, { recursive: true })

const backupFile = await open(backupPath, 'wx')
let backupCompleted = false

try {
    await new Promise<void>((resolve, reject) => {
        const backup = spawn(
            'docker',
            [
                'compose',
                '-f',
                composeFile,
                'exec',
                '-T',
                'postgres',
                'sh',
                '-c',
                'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom',
            ],
            {
                cwd: repositoryRoot,
                stdio: ['ignore', backupFile.fd, 'inherit'],
            },
        )

        backup.once('error', reject)
        backup.once('exit', (code, signal) => {
            if (code === 0) {
                resolve()
                return
            }

            reject(new Error(`Database backup failed (${signal ?? `exit ${code ?? 'unknown'}`})`))
        })
    })
    backupCompleted = true
} finally {
    await backupFile.close()

    if (!backupCompleted) {
        await rm(backupPath, { force: true })
    }
}

console.log(`Database backup written to ${path.relative(repositoryRoot, backupPath)}`)
