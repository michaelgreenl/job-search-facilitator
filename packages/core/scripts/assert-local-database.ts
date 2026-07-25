import { databaseUrl } from '../prisma.config.ts'

const allowedProtocols = new Set(['postgres:', 'postgresql:'])
const allowedHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const allowedDatabaseName = 'job_search_facilitator'
const rejectionMessage = 'Database reset is restricted to the local job_search_facilitator database'

try {
    const url = new URL(databaseUrl)
    const databaseName = decodeURIComponent(url.pathname.slice(1))

    if (
        !allowedProtocols.has(url.protocol) ||
        !allowedHostnames.has(url.hostname) ||
        databaseName !== allowedDatabaseName
    ) {
        throw new Error()
    }
} catch {
    console.error(rejectionMessage)
    process.exitCode = 1
}
