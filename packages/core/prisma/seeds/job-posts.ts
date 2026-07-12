import {
    ApplicationStatus,
    PostStatus,
    UserLabel,
    type Prisma,
} from '../../src/generated/prisma/client.ts'

interface JobPostSeed {
    sourceKey: string
    roleTitle: string
    company: string
    location: string | null
    compensation: string | null
    postSource: string
    applicationUrl: string
    postStatus: PostStatus
    applicationStatus: ApplicationStatus
    userRank: number | null
    userLabel: UserLabel | null
    archivedAt: Date | null
}

export const jobPostSeeds: readonly JobPostSeed[] = [
    {
        sourceKey: 'seed:northstar-frontend',
        roleTitle: 'Senior Frontend Engineer',
        company: 'Example Northstar Studio',
        location: 'Remote — United States',
        compensation: '$145,000–$170,000',
        postSource: 'Example Careers',
        applicationUrl: 'https://example.com/jobs/seed-northstar-frontend',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.INTERVIEWING,
        userRank: 1,
        userLabel: UserLabel.P1,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:copper-finch-full-stack',
        roleTitle: 'Full-Stack TypeScript Engineer',
        company: 'Example Copper Finch Labs',
        location: 'Detroit, MI (Hybrid)',
        compensation: '$125,000–$155,000',
        postSource: 'Example Job Board',
        applicationUrl: 'https://example.com/jobs/seed-copper-finch-full-stack',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.AWAITING_RESPONSE,
        userRank: 2,
        userLabel: UserLabel.P2,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:lakeview-backend',
        roleTitle: 'Backend Platform Engineer',
        company: 'Example Lakeview Systems',
        location: null,
        compensation: '$135,000–$165,000',
        postSource: 'Example Careers',
        applicationUrl: 'https://example.com/jobs/seed-lakeview-backend',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: 3,
        userLabel: UserLabel.QUICK_APP,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:juniper-ui-infrastructure',
        roleTitle: 'UI Infrastructure Engineer',
        company: 'Example Juniper Trail Software',
        location: 'Ann Arbor, MI',
        compensation: null,
        postSource: 'Example Job Board',
        applicationUrl: 'https://example.com/jobs/seed-juniper-ui-infrastructure',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.REJECTED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:moonrise-developer-experience',
        roleTitle: 'Developer Experience Engineer',
        company: 'Example Moonrise Civic Studio',
        location: 'Remote',
        compensation: '$130,000–$158,000',
        postSource: 'Example Careers',
        applicationUrl: 'https://example.com/jobs/seed-moonrise-developer-experience',
        postStatus: PostStatus.CLOSED,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: new Date('2026-06-15T12:00:00.000Z'),
    },
    {
        sourceKey: 'seed:emberline-product',
        roleTitle: 'Product Engineer',
        company: 'Example Emberline Tools',
        location: 'Chicago, IL (Hybrid)',
        compensation: null,
        postSource: 'Example Job Board',
        applicationUrl: 'https://example.com/jobs/seed-emberline-product',
        postStatus: PostStatus.UNKNOWN,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:atlas-grove-node-api',
        roleTitle: 'Node.js API Engineer',
        company: 'Example Atlas Grove Cooperative',
        location: 'Remote — Eastern Time',
        compensation: '$140,000–$172,000',
        postSource: 'Example Careers',
        applicationUrl: 'https://example.com/jobs/seed-atlas-grove-node-api',
        postStatus: PostStatus.CLOSED,
        applicationStatus: ApplicationStatus.HIRED,
        userRank: 1,
        userLabel: UserLabel.P1,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:blue-heron-design-systems',
        roleTitle: 'Design Systems Engineer',
        company: 'Example Blue Heron Analytics',
        location: null,
        compensation: '$120,000–$148,000',
        postSource: 'Example Job Board',
        applicationUrl: 'https://example.com/jobs/seed-blue-heron-design-systems',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:cedar-signal-performance',
        roleTitle: 'Web Performance Engineer',
        company: 'Example Cedar and Signal',
        location: 'Grand Rapids, MI',
        compensation: null,
        postSource: 'Example Careers',
        applicationUrl: 'https://example.com/jobs/seed-cedar-signal-performance',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:great-lakes-internal-tools',
        roleTitle: 'Software Engineer, Internal Tools',
        company: 'Example Great Lakes Test Works',
        location: 'Remote — United States',
        compensation: '$118,000–$142,000',
        postSource: 'Example Job Board',
        applicationUrl: 'https://example.com/jobs/seed-great-lakes-internal-tools',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:lumen-harbor-accessibility',
        roleTitle: 'Accessibility Engineer',
        company: 'Example Lumen Harbor',
        location: 'Remote',
        compensation: '$128,000–$154,000',
        postSource: 'Example Careers',
        applicationUrl: 'https://example.com/jobs/seed-lumen-harbor-accessibility',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:paper-kite-typescript',
        roleTitle: 'TypeScript Application Engineer',
        company: 'Example Paper Kite Systems',
        location: null,
        compensation: null,
        postSource: 'Example Job Board',
        applicationUrl: 'https://example.com/jobs/seed-paper-kite-typescript',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userRank: null,
        userLabel: null,
        archivedAt: null,
    },
]

const toListingUpdate = (post: JobPostSeed): Prisma.JobPostUpdateInput => ({
    roleTitle: post.roleTitle,
    company: post.company,
    location: post.location,
    compensation: post.compensation,
    postSource: post.postSource,
    applicationUrl: post.applicationUrl,
    postStatus: post.postStatus,
})

export const seedJobPosts = async (
    transaction: Prisma.TransactionClient,
): Promise<Map<string, string>> => {
    const postIds = new Map<string, string>()

    for (const post of jobPostSeeds) {
        const savedPost = await transaction.jobPost.upsert({
            where: { sourceKey: post.sourceKey },
            create: post,
            update: toListingUpdate(post),
            select: { id: true, sourceKey: true },
        })

        postIds.set(savedPost.sourceKey, savedPost.id)
    }

    return postIds
}
