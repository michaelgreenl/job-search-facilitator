import { execFileSync } from 'node:child_process'

const testDatabaseUrl = process.env.TEST_DATABASE_URL

if (testDatabaseUrl === undefined) {
    throw new Error('TEST_DATABASE_URL is required for integration tests')
}

const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1))

if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL database name must end in "_test"')
}

const childEnvironment = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
}

execFileSync('pnpm', ['--filter', '@job-search-facilitator/core', 'run', 'generate'], {
    env: childEnvironment,
    stdio: 'inherit',
})
execFileSync('pnpm', ['--filter', '@job-search-facilitator/core', 'run', 'db:deploy'], {
    env: childEnvironment,
    stdio: 'inherit',
})
execFileSync('pnpm', ['--filter', 'server', 'run', 'test:integration'], {
    env: childEnvironment,
    stdio: 'inherit',
})
