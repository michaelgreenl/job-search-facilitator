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
    techStack: string
    postSource: string
    postUrl: string
    applicationUrl: string
    postStatus: PostStatus
    applicationStatus: ApplicationStatus
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
        techStack: 'TypeScript, Vue, Storybook, Playwright',
        postSource: 'Example Careers',
        postUrl: 'https://example.com/jobs/seed-northstar-frontend',
        applicationUrl: 'https://example.com/jobs/seed-northstar-frontend',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.INTERVIEWING,
        userLabel: UserLabel.P1,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:copper-finch-full-stack',
        roleTitle: 'Full-Stack TypeScript Engineer',
        company: 'Example Copper Finch Labs',
        location: 'Detroit, MI (Hybrid)',
        compensation: '$125,000–$155,000',
        techStack: 'TypeScript, Vue, Node.js, PostgreSQL',
        postSource: 'Example Job Board',
        postUrl: 'https://example.com/jobs/seed-copper-finch-full-stack',
        applicationUrl: 'https://example.com/jobs/seed-copper-finch-full-stack',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.AWAITING_RESPONSE,
        userLabel: UserLabel.P2,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:lakeview-backend',
        roleTitle: 'Backend Platform Engineer',
        company: 'Example Lakeview Systems',
        location: null,
        compensation: '$135,000–$165,000',
        techStack: 'Node.js, PostgreSQL, Redis, AWS',
        postSource: 'Example Careers',
        postUrl: 'https://example.com/jobs/seed-lakeview-backend',
        applicationUrl: 'https://example.com/jobs/seed-lakeview-backend',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: UserLabel.QUICK_APP,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:juniper-ui-infrastructure',
        roleTitle: 'UI Infrastructure Engineer',
        company: 'Example Juniper Trail Software',
        location: 'Ann Arbor, MI',
        compensation: null,
        techStack: 'TypeScript, Vue, Vite, Storybook',
        postSource: 'Example Job Board',
        postUrl: 'https://example.com/jobs/seed-juniper-ui-infrastructure',
        applicationUrl: 'https://example.com/jobs/seed-juniper-ui-infrastructure',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.REJECTED,
        userLabel: UserLabel.FORGO,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:moonrise-developer-experience',
        roleTitle: 'Developer Experience Engineer',
        company: 'Example Moonrise Civic Studio',
        location: 'Remote',
        compensation: '$130,000–$158,000',
        techStack: 'TypeScript, Node.js, GitHub Actions',
        postSource: 'Example Careers',
        postUrl: 'https://example.com/jobs/seed-moonrise-developer-experience',
        applicationUrl: 'https://example.com/jobs/seed-moonrise-developer-experience',
        postStatus: PostStatus.CLOSED,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: new Date('2026-06-15T12:00:00.000Z'),
    },
    {
        sourceKey: 'seed:emberline-product',
        roleTitle: 'Product Engineer',
        company: 'Example Emberline Tools',
        location: 'Chicago, IL (Hybrid)',
        compensation: null,
        techStack: 'TypeScript, Vue, Node.js',
        postSource: 'Example Job Board',
        postUrl: 'https://example.com/jobs/seed-emberline-product',
        applicationUrl: 'https://example.com/jobs/seed-emberline-product',
        postStatus: PostStatus.UNKNOWN,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:atlas-grove-node-api',
        roleTitle: 'Node.js API Engineer',
        company: 'Example Atlas Grove Cooperative',
        location: 'Remote — Eastern Time',
        compensation: '$140,000–$172,000',
        techStack: 'Node.js, TypeScript, PostgreSQL, Kubernetes',
        postSource: 'Example Careers',
        postUrl: 'https://example.com/jobs/seed-atlas-grove-node-api',
        applicationUrl: 'https://example.com/jobs/seed-atlas-grove-node-api',
        postStatus: PostStatus.CLOSED,
        applicationStatus: ApplicationStatus.HIRED,
        userLabel: UserLabel.P1,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:blue-heron-design-systems',
        roleTitle: 'Design Systems Engineer',
        company: 'Example Blue Heron Analytics',
        location: null,
        compensation: '$120,000–$148,000',
        techStack: 'Vue, TypeScript, Storybook, Sass',
        postSource: 'Example Job Board',
        postUrl: 'https://example.com/jobs/seed-blue-heron-design-systems',
        applicationUrl: 'https://example.com/jobs/seed-blue-heron-design-systems',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:cedar-signal-performance',
        roleTitle: 'Web Performance Engineer',
        company: 'Example Cedar and Signal',
        location: 'Grand Rapids, MI',
        compensation: null,
        techStack: 'JavaScript, Web Vitals, Playwright',
        postSource: 'Example Careers',
        postUrl: 'https://example.com/jobs/seed-cedar-signal-performance',
        applicationUrl: 'https://example.com/jobs/seed-cedar-signal-performance',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:great-lakes-internal-tools',
        roleTitle: 'Software Engineer, Internal Tools',
        company: 'Example Great Lakes Test Works',
        location: 'Remote — United States',
        compensation: '$118,000–$142,000',
        techStack: 'TypeScript, Node.js, PostgreSQL, Docker',
        postSource: 'Example Job Board',
        postUrl: 'https://example.com/jobs/seed-great-lakes-internal-tools',
        applicationUrl: 'https://example.com/jobs/seed-great-lakes-internal-tools',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:lumen-harbor-accessibility',
        roleTitle: 'Accessibility Engineer',
        company: 'Example Lumen Harbor',
        location: 'Remote',
        compensation: '$128,000–$154,000',
        techStack: 'Vue, TypeScript, axe-core, Playwright',
        postSource: 'Example Careers',
        postUrl: 'https://example.com/jobs/seed-lumen-harbor-accessibility',
        applicationUrl: 'https://example.com/jobs/seed-lumen-harbor-accessibility',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: null,
    },
    {
        sourceKey: 'seed:paper-kite-typescript',
        roleTitle: 'TypeScript Application Engineer',
        company: 'Example Paper Kite Systems',
        location: null,
        compensation: null,
        techStack: 'TypeScript, Vue, Node.js',
        postSource: 'Example Job Board',
        postUrl: 'https://example.com/jobs/seed-paper-kite-typescript',
        applicationUrl: 'https://example.com/jobs/seed-paper-kite-typescript',
        postStatus: PostStatus.ACTIVE,
        applicationStatus: ApplicationStatus.NOT_APPLIED,
        userLabel: null,
        archivedAt: null,
    },
]

const seededApplicationStatusAt = new Date('2026-07-01T12:00:00.000Z')

const toCreateData = (post: JobPostSeed): Prisma.JobPostCreateInput => ({
    ...post,
    appliedAt:
        post.applicationStatus === ApplicationStatus.NOT_APPLIED ? null : seededApplicationStatusAt,
    applicationStatusUpdatedAt:
        post.applicationStatus === ApplicationStatus.NOT_APPLIED ? null : seededApplicationStatusAt,
})

const toListingUpdate = (post: JobPostSeed): Prisma.JobPostUpdateInput => ({
    roleTitle: post.roleTitle,
    company: post.company,
    location: post.location,
    compensation: post.compensation,
    techStack: post.techStack,
    postSource: post.postSource,
    postUrl: post.postUrl,
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
            create: toCreateData(post),
            update: toListingUpdate(post),
            select: { id: true, sourceKey: true },
        })

        postIds.set(savedPost.sourceKey, savedPost.id)
    }

    return postIds
}
