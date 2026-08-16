import type { JobPostInput } from '@job-search-facilitator/core'

const trackingQueryKeys = new Set([
    'dclid',
    'fbclid',
    'gclid',
    'gh_src',
    'lever-source',
    'mc_cid',
    'mc_eid',
    'msclkid',
    'ref',
    'referrer',
    'source',
    'sourceid',
    'trk',
    'trackingid',
])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const greenhouseHosts = ['greenhouse.io', 'greenhouse.com']
const atsUuidHosts = {
    ashby: ['ashbyhq.com'],
    lever: ['lever.co'],
    rippling: ['rippling.com'],
} as const
const workdayHosts = ['myworkdayjobs.com', 'myworkdaysite.com']
const sharedDiscoveryHosts = ['indeed.com', 'linkedin.com', 'news.ycombinator.com']
const jobPathMarkers = new Set([
    'career',
    'careers',
    'job',
    'jobs',
    'opening',
    'openings',
    'opportunities',
    'opportunity',
    'position',
    'positions',
    'role',
    'roles',
])
const jobQueryKeys = new Set([
    'gh_jid',
    'job',
    'job_id',
    'jobid',
    'opportunityid',
    'r_id',
    'reqid',
    'requisitionid',
    'signup_job_id',
])

const hostMatches = (hostname: string, domains: readonly string[]): boolean =>
    domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))

const decodePathSegment = (value: string): string => {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

const normalizedUrlAlias = (url: URL): string => {
    const query = [...url.searchParams]
        .filter(([key]) => !key.toLowerCase().startsWith('utm_'))
        .filter(([key]) => !trackingQueryKeys.has(key.toLowerCase()))
        .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
            const keyOrder = leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
            return keyOrder === 0
                ? leftValue < rightValue
                    ? -1
                    : leftValue > rightValue
                      ? 1
                      : 0
                : keyOrder
        })
    const search = new URLSearchParams(query).toString()
    const withoutTrailingSlash = url.pathname.replace(/\/+$/, '')
    const withoutApplicationSuffix = withoutTrailingSlash.replace(/\/(?:application|apply)$/i, '')
    const pathname = withoutApplicationSuffix.replace(/\/+$/, '')

    return `url:${url.host.toLowerCase()}${pathname}${search.length === 0 ? '' : `?${search}`}`
}

const normalizedRequisitionId = (value: string): string | null => {
    const match = decodePathSegment(value).match(/(?:^|_)((?:jr|req|r)[-_]?\d{3,})$/i)
    return match?.[1]?.replaceAll('-', '').replaceAll('_', '').toUpperCase() ?? null
}

const isCanonicalJobUrl = (url: URL, pathSegments: string[]): boolean => {
    const hostname = url.hostname.toLowerCase()

    if (hostMatches(hostname, sharedDiscoveryHosts)) {
        return false
    }

    const hasJobPath = pathSegments.some(
        (segment, index) =>
            jobPathMarkers.has(segment.toLowerCase()) && pathSegments[index + 1] !== undefined,
    )
    const hasJobQuery = [...url.searchParams.keys()].some((key) =>
        jobQueryKeys.has(key.toLowerCase()),
    )
    const hasAtsUuid = Object.values(atsUuidHosts).some(
        (domains) =>
            hostMatches(hostname, domains) &&
            [...pathSegments, ...url.searchParams.values()].some((part) => uuidPattern.test(part)),
    )

    return hasJobPath || hasJobQuery || hasAtsUuid
}

const identityAliasesForUrl = (value: string): string[] => {
    const url = URL.parse(value)

    if (url === null) {
        return []
    }

    const hostname = url.hostname.toLowerCase()
    const pathSegments = url.pathname.split('/').filter(Boolean).map(decodePathSegment)
    const aliases = isCanonicalJobUrl(url, pathSegments) ? [normalizedUrlAlias(url)] : []
    const greenhouseQueryId = [...url.searchParams].find(
        ([key, id]) => key.toLowerCase() === 'gh_jid' && /^\d+$/.test(id),
    )?.[1]

    if (greenhouseQueryId !== undefined) {
        aliases.push(`greenhouse:${greenhouseQueryId}`)
    }

    if (hostMatches(hostname, greenhouseHosts)) {
        const jobsIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'jobs')
        const greenhousePathId = jobsIndex === -1 ? undefined : pathSegments[jobsIndex + 1]

        if (greenhousePathId !== undefined && /^\d+$/.test(greenhousePathId)) {
            aliases.push(`greenhouse:${greenhousePathId}`)
        }
    }

    for (const [provider, domains] of Object.entries(atsUuidHosts)) {
        if (!hostMatches(hostname, domains)) {
            continue
        }

        const uuid = [...pathSegments, ...url.searchParams.values()].find((part) =>
            uuidPattern.test(part),
        )

        if (uuid !== undefined) {
            aliases.push(`${provider}:${uuid.toLowerCase()}`)
        }
    }

    if (hostMatches(hostname, workdayHosts)) {
        const requisitionId = [...pathSegments, ...url.searchParams.values()]
            .map(normalizedRequisitionId)
            .find((id) => id !== null)

        if (requisitionId !== undefined) {
            aliases.push(`workday:${hostname}:${requisitionId}`)
        }
    }

    return aliases
}

export const identityAliasesForPost = (
    post: Pick<JobPostInput, 'postUrl' | 'applicationUrl'>,
): string[] => [
    ...new Set([
        ...identityAliasesForUrl(post.postUrl),
        ...identityAliasesForUrl(post.applicationUrl),
    ]),
]

export const identityTokensForPost = (
    post: Pick<JobPostInput, 'sourceKey' | 'postUrl' | 'applicationUrl'>,
): string[] => [`source-key:${post.sourceKey}`, ...identityAliasesForPost(post)]
