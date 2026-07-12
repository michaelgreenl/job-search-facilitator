import 'dotenv/config'

const localDatabaseUrl =
    'postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator'

export const env = {
    PORT: Number(process.env.PORT ?? 3000),
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    DATABASE_URL: process.env.DATABASE_URL ?? localDatabaseUrl,
}
