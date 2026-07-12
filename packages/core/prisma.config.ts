import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

loadEnv({
    path: '../app/server/.env',
    quiet: true,
})

const localDatabaseUrl =
    'postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator'

export const databaseUrl = process.env.DATABASE_URL ?? localDatabaseUrl

export default defineConfig({
    schema: 'prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'node prisma/seed.ts',
    },
    datasource: {
        url: databaseUrl,
    },
})
