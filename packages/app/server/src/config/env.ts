import 'dotenv/config'
import { z } from 'zod'

const localDatabaseUrl =
  'postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).default(localDatabaseUrl),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnv.error)}`)
}

export const env = parsedEnv.data
