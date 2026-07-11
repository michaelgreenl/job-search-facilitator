import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@job-search-facilitator/core/prisma'
import { env } from '../config/env.ts'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
