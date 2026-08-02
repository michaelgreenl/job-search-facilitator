import { PrismaPg } from '@prisma/adapter-pg'
import { databaseUrl } from '../../prisma.config.ts'
import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { seedJobPosts } from './job-posts.ts'
import { seedSearchReports } from './search-reports.ts'

const adapter = new PrismaPg({ connectionString: databaseUrl })
const prisma = new PrismaClient({ adapter })

export const seedDatabase = async (): Promise<void> => {
    await prisma.$transaction(async (transaction) => {
        const postIds = await seedJobPosts(transaction)

        await seedSearchReports(transaction, postIds)
    })
}

try {
    await seedDatabase()
    console.log('Seeded 12 job posts and 2 search reports.')
} catch (error) {
    console.error('Database seed failed:', error)
    process.exitCode = 1
} finally {
    await prisma.$disconnect()
}
