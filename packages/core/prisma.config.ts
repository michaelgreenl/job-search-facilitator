import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

loadEnv({
  path: fileURLToPath(new URL('../app/server/.env', import.meta.url)),
  quiet: true,
})

const localDatabaseUrl =
  'postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator'

export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
})
