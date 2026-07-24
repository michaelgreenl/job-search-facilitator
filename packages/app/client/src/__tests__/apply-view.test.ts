/** @vitest-environment jsdom */

import type {
    ApplyQueueItem,
    JobPost,
    JobRecommendationContext,
    JobSearchReport,
    OutreachContact,
    UserLabel,
    WorkTaskEvent,
} from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePostStore } from '@/stores/post.store'
import ApplyView from '../views/ApplyView.vue'

const createPost = (id: string, userLabel: UserLabel): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle: `${userLabel} Engineer`,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: `https://example.com/jobs/${id}`,
    applicationUrl: `https://apply.example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userLabel,
    archivedAt: null,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
})

const posts = [
    createPost('30000000-0000-4000-8000-000000000001', 'P1'),
    createPost('30000000-0000-4000-8000-000000000002', 'P2'),
    createPost('30000000-0000-4000-8000-000000000003', 'quick-app'),
]
const report: JobSearchReport = {
    id: '40000000-0000-4000-8000-000000000001',
    reportDate: '2026-07-16',
    summary: 'Three application candidates',
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
    archivedAt: null,
    results: posts.map((post, index) => ({
        agentRank: index + 1,
        agentLabel: post.userLabel === 'quick-app' ? 'quick-app' : 'target',
        fitRationale: `Fit rationale for ${post.roleTitle}`,
        applicationFlow: 'Direct application',
        keyLegitimacySignals: `Legitimacy signals for ${post.roleTitle}`,
        recommendedResume: index === 1 ? 'backend-full-stack' : 'frontend',
        recommendedAction: `Recommended action for ${post.roleTitle}`,
        legitimacyNotes: `Legitimacy notes for ${post.roleTitle}`,
        post,
    })),
}
const applyQueueItems: ApplyQueueItem[] = report.results.map(({ post, ...recommendation }) => ({
    post,
    recommendationContext: {
        reportId: report.id,
        reportDate: report.reportDate,
        ...recommendation,
    },
}))
const createApplyQueueItem = (
    post: JobPost,
    recommendationContext: JobRecommendationContext | null = applyQueueItems.find(
        (item) => item.post.id === post.id,
    )?.recommendationContext ?? null,
): ApplyQueueItem => ({ post, recommendationContext })

const runningWorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const savedContact: OutreachContact = {
    id: '50000000-0000-4000-8000-000000000001',
    jobPostId: posts[0]!.id,
    personName: 'Grace Hopper',
    personTitle: 'Director of Engineering',
    profileUrl: 'https://www.linkedin.com/in/grace-hopper',
    relevanceRationale: 'Her visible role aligns with the engineering team.',
    draftMessage: 'Hi Grace, I would value your perspective on the engineering team.',
    messaged: true,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
}
const discoveredContact: OutreachContact = {
    id: '50000000-0000-4000-8000-000000000002',
    jobPostId: posts[1]!.id,
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale:
        'Their Engineering Manager title aligns with this role, and their platform leadership gives them direct context on the team, its priorities, and the day-to-day work.',
    draftMessage: 'Hi Ada, I would value your perspective on the P2 Engineer role.',
    messaged: false,
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
}

const linkedInActionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'
const linkedInActionRequired = {
    type: 'action-required',
    action: {
        id: linkedInActionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://www.linkedin.com?',
        origin: 'https://www.linkedin.com',
    },
    createdAt: '2026-07-18T12:00:00.000Z',
} satisfies WorkTaskEvent
const exampleActionId = 'b110f66c-b31c-4db5-90ad-89ac670d6ce0'
const exampleActionRequired = {
    type: 'action-required',
    action: {
        id: exampleActionId,
        kind: 'browser-origin',
        message: 'Allow Chrome to access https://example.com?',
        origin: 'https://example.com',
    },
    createdAt: '2026-07-18T12:00:02.000Z',
} satisfies WorkTaskEvent

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
const fetchUrl = (input: string | URL | Request) =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

class FakeEventSource {
    static instances: FakeEventSource[] = []

    readonly close = vi.fn()
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this)
    }

    message(event: WorkTaskEvent) {
        this.onmessage?.({ data: JSON.stringify(event) })
    }
}

const mountApplyView = async (
    pinia: Pinia = createPinia(),
    { waitForPosts = true }: { waitForPosts?: boolean } = {},
) => {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ApplyView)
    app.use(pinia)
    app.mount(root)
    mountedApps.push({ app, root })

    if (waitForPosts) {
        await vi.waitFor(() => expect(root.textContent).toContain('P1 Engineer'))
    }

    return root
}

const findButton = (root: HTMLElement, text: string) => {
    const button = [...root.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes(text),
    )

    if (button === undefined) {
        throw new Error(`Could not find button containing "${text}"`)
    }

    return button
}

const expectButtonTooltip = (root: HTMLElement, label: string) => {
    const button = root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
    const tooltipId = button?.getAttribute('aria-describedby')
    const tooltip = tooltipId ? document.getElementById(tooltipId) : null

    expect(button).not.toBeNull()
    expect(tooltip?.getAttribute('role')).toBe('tooltip')
    expect(tooltip?.textContent?.trim()).toBe(label)
}

const openJobPostActions = async (root: HTMLElement) => {
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="Job post label"]')

    if (trigger === null) {
        throw new Error('Could not find job post action menu')
    }

    trigger.click()
    await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).not.toBeNull())

    return {
        items: [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')],
        trigger,
    }
}

const chooseJobPostAction = async (root: HTMLElement, label: string) => {
    const { items, trigger } = await openJobPostActions(root)
    const item = items.find((candidate) => candidate.textContent?.trim() === label)

    if (item === undefined) {
        throw new Error(`Could not find job post action "${label}"`)
    }

    item.click()
    return trigger
}

describe('apply view', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(applyQueueItems)))
    })

    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }

        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
        vi.unstubAllGlobals()
    })

    it('shows post and application actions for a shared destination', async () => {
        const sharedDestinationPost = {
            ...posts[0]!,
            applicationUrl: posts[0]!.postUrl,
        }
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse([createApplyQueueItem(sharedDestinationPost)]),
        )
        const root = await mountApplyView()

        findButton(root, sharedDestinationPost.roleTitle).click()
        await nextTick()

        const applicationLink = root.querySelector<HTMLAnchorElement>(
            `a[aria-label="Open application for ${sharedDestinationPost.roleTitle} in a new tab"]`,
        )

        expect(applicationLink?.href).toBe(sharedDestinationPost.applicationUrl)
        expect(
            root.querySelector<HTMLAnchorElement>(
                `a[aria-label="Open ${sharedDestinationPost.roleTitle} in a new tab"]`,
            )?.href,
        ).toBe(sharedDestinationPost.postUrl)
    })

    it('filters application candidates by user label', async () => {
        const root = await mountApplyView()
        const filter = root.querySelector<HTMLButtonElement>(
            'button[aria-label="Filter job posts"]',
        )

        if (filter === null) {
            throw new Error('Could not find job post filter')
        }

        expect(root.querySelector('select[aria-label="Filter job posts"]')).toBeNull()
        expect(filter.closest('.post-filter-dropdown')).not.toBeNull()
        filter.click()

        await vi.waitFor(() => {
            expect(
                [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].map((item) =>
                    item.textContent?.trim(),
                ),
            ).toEqual(['All', 'P1', 'P2', 'quick-app'])
        })

        const p2Filter = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
            ({ textContent }) => textContent?.trim() === 'P2',
        )

        if (p2Filter === undefined) {
            throw new Error('Could not find P2 filter option')
        }

        p2Filter.click()

        await vi.waitFor(() => {
            expect(filter.textContent).toContain('P2')
            expect(root.textContent).toContain('P2 Engineer')
            expect(root.textContent).not.toContain('P1 Engineer')
            expect(root.textContent).not.toContain('quick-app Engineer')
        })
    })

    it('does not admit a post fetched outside the Apply queue during the current visit', async () => {
        const outsideQueuePost = {
            ...createPost('30000000-0000-4000-8000-000000000004', 'P1'),
            roleTitle: 'Outside Queue Engineer',
        }
        const pinia = createPinia()
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse(outsideQueuePost))
        const root = await mountApplyView(pinia)

        await usePostStore(pinia).fetchPost(outsideQueuePost.id)
        await nextTick()

        expect(root.textContent).not.toContain(outsideQueuePost.roleTitle)
    })

    it('moves between the post list and viewer', async () => {
        const fetchMock = vi.mocked(fetch)
        const root = await mountApplyView()
        const selectedPost = posts[1]
        const selectedResult = report.results[1]
        const list = root.querySelector('.apply-post-list')
        const viewer = root.querySelector('.apply-job-post-view')

        if (selectedPost === undefined || selectedResult === undefined) {
            throw new Error('Could not find the selected result fixture')
        }

        expect(list?.classList.contains('is-active')).toBe(true)
        expect(list?.classList.contains('is-adjacent')).toBe(false)
        expect(viewer?.classList.contains('is-active')).toBe(false)
        expect(viewer?.classList.contains('is-adjacent')).toBe(true)
        expect(
            [...(list?.querySelectorAll('.card-list > li') ?? [])].map(
                (item) => posts.find(({ roleTitle }) => item.textContent?.includes(roleTitle))?.id,
            ),
        ).toEqual(applyQueueItems.map(({ post }) => post.id))
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/api/job-posts/apply-queue',
            undefined,
        )
        expect(
            fetchMock.mock.calls.some(([input]) =>
                fetchUrl(input).endsWith('/api/job-search-reports'),
            ),
        ).toBe(false)

        findButton(root, 'P2 Engineer').click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(false)
            expect(list?.classList.contains('is-adjacent')).toBe(true)
            expect(viewer?.classList.contains('is-active')).toBe(true)
            expect(viewer?.classList.contains('is-adjacent')).toBe(false)
        })
        expect(
            root
                .querySelector('[aria-label="Back to job posts"]')
                ?.closest('.back-button-mobile-only'),
        ).not.toBeNull()
        expect(viewer?.querySelector('.post-content')?.textContent).toContain(
            selectedPost.techStack,
        )
        expect(viewer?.querySelector('.post-content')?.textContent).toContain(
            selectedPost.postSource,
        )
        expect(viewer?.querySelector('.post-content')?.textContent).toContain(
            selectedResult.recommendedAction,
        )
        expect(viewer?.querySelector('.post-analysis')).not.toBeNull()
        expect(viewer?.textContent).not.toContain('Legitimacy')
        expect(findButton(root, "Discover contact's")).not.toBeNull()

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(true)
            expect(list?.classList.contains('is-adjacent')).toBe(false)
            expect(viewer?.classList.contains('is-active')).toBe(false)
            expect(viewer?.classList.contains('is-adjacent')).toBe(true)
        })
    })

    it('opens and updates saved contacts without starting another discovery', async () => {
        let resolveContactUpdate: ((response: Response) => void) | undefined
        const contactUpdateResponse = new Promise<Response>((resolve) => {
            resolveContactUpdate = resolve
        })
        const updatedContact = {
            ...savedContact,
            messaged: false,
            updatedAt: '2026-07-22T12:00:00.000Z',
        }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockReturnValueOnce(contactUpdateResponse)
            .mockResolvedValueOnce(jsonResponse([updatedContact]))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(
                root.querySelector('[aria-label="Open outreach draft for Grace Hopper"]'),
            ).not.toBeNull()
            expect(root.querySelector('.work-updates')).toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
            expect(root.querySelector('.contact-history input[type="checkbox"]')).toBeNull()
        })
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(fetchMock).toHaveBeenCalledTimes(2)

        const contactFilter = root.querySelector<HTMLButtonElement>(
            'button[aria-label="Filter saved contacts"]',
        )

        if (contactFilter === null) {
            throw new Error('Could not find saved contact filter')
        }

        contactFilter.click()
        await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).not.toBeNull())
        const messagedFilter = [
            ...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
        ].find(({ textContent }) => textContent?.trim() === 'Messaged')

        if (messagedFilter === undefined) {
            throw new Error('Could not find Messaged contact filter')
        }

        messagedFilter.click()
        await vi.waitFor(() => expect(contactFilter.textContent?.trim()).toBe('Messaged'))

        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Grace Hopper"]',
        )?.click()

        await vi.waitFor(() => {
            expect(root.textContent).toContain('Messaged')
            expect(
                root.querySelector<HTMLTextAreaElement>('[aria-label="Outreach message"]')?.value,
            ).toBe(savedContact.draftMessage)
        })

        const messagedControl = root.querySelector<HTMLButtonElement>(
            '.draft-contact-card button[aria-pressed]',
        )

        if (messagedControl === null) {
            throw new Error('Could not find draft contact messaged control')
        }

        expect(messagedControl.getAttribute('aria-pressed')).toBe('true')
        expect(messagedControl.textContent).toContain('✓ Messaged')
        messagedControl.click()

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(3)
            expect(messagedControl.getAttribute('aria-pressed')).toBe('true')
            expect(messagedControl.textContent).toContain('Saving…')
            expect(messagedControl.querySelector('.loading-spinner')).not.toBeNull()
            expect(messagedControl.disabled).toBe(true)
            expect(findButton(root, "Discover contact's").disabled).toBe(true)
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(
                root.querySelector<HTMLButtonElement>('[aria-label="Discover another contact"]')
                    ?.disabled,
            ).toBe(true)
            expect(
                root
                    .querySelector<HTMLButtonElement>('button[aria-label="Filter saved contacts"]')
                    ?.textContent?.trim(),
            ).toBe('Messaged')
        })

        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Grace Hopper"]',
        )?.click()

        const pendingMessagedControl = await vi.waitFor(() => {
            const control = root.querySelector<HTMLButtonElement>(
                '.draft-contact-card button[aria-pressed]',
            )

            if (control === null) {
                throw new Error('Could not find pending messaged control')
            }

            expect(control.disabled).toBe(true)
            return control
        })

        resolveContactUpdate?.(jsonResponse(updatedContact))

        await vi.waitFor(() => {
            expect(pendingMessagedControl.getAttribute('aria-pressed')).toBe('false')
            expect(pendingMessagedControl.textContent).toContain('Mark as messaged')
            expect(pendingMessagedControl.disabled).toBe(false)
            expect(findButton(root, "Discover contact's").disabled).toBe(false)
        })
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3000/api/job-posts/${savedContact.jobPostId}/outreach-contacts/${savedContact.id}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaged: false }),
            },
        )

        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
            expect(root.textContent).toContain('No contacts match this filter.')
            expect(root.textContent).not.toContain('Grace Hopper')
            expect(
                root
                    .querySelector<HTMLButtonElement>('button[aria-label="Filter saved contacts"]')
                    ?.textContent?.trim(),
            ).toBe('Messaged')
        })
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('shows a failed messaged update in the drafting card', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()
        await vi.waitFor(() => {
            expect(
                root.querySelector('[aria-label="Open outreach draft for Grace Hopper"]'),
            ).not.toBeNull()
        })
        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Grace Hopper"]',
        )?.click()

        const messagedControl = await vi.waitFor(() => {
            const control = root.querySelector<HTMLButtonElement>(
                '.draft-contact-card button[aria-pressed]',
            )

            if (control === null) {
                throw new Error('Could not find messaged control')
            }

            return control
        })
        messagedControl.click()

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')?.textContent).toContain(
                'API request failed (500)',
            )
            expect(messagedControl.getAttribute('aria-pressed')).toBe('true')
            expect(messagedControl.textContent).toContain('✓ Messaged')
            expect(messagedControl.disabled).toBe(false)
        })
    })

    it('navigates back from an expanded draft through contacts to the job post', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('[aria-label="Open outreach draft for Grace Hopper"]'),
            ).not.toBeNull()
        })

        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Grace Hopper"]',
        )?.click()

        await vi.waitFor(() => {
            const outreachPanel = root.querySelector('section[aria-label="Outreach"]')

            expect(root.querySelector('[aria-label="Back to saved contacts"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Show selected job post"]')).toBeNull()
            expect(outreachPanel?.querySelectorAll('.back-button')).toHaveLength(1)
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Expand panel"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.draft-board')?.classList.contains('is-expanded')).toBe(true)
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(false)
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(true)
            expect(root.querySelector('[aria-label="Expand panel"]')).toBeNull()
            expect(root.querySelector('[aria-label="Collapse panel"]')).toBeNull()
        })

        const backToJobPost = root.querySelector<HTMLButtonElement>(
            '[aria-label="Back to job post"]',
        )

        expect(backToJobPost?.closest('.back-button-mobile-only')).not.toBeNull()
        expect(backToJobPost?.classList.contains('back-button')).toBe(true)
        expect(backToJobPost?.querySelector('.back-button-icon')).not.toBeNull()
        expect(root.querySelector('[aria-label="Back to saved contacts"]')).toBeNull()
        expect(root.querySelector('[aria-label="Show selected job post"]')).toBeNull()
        expectButtonTooltip(root, 'Back to job post')
        backToJobPost?.click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-active'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                false,
            )
        })
    })

    it('starts another discovery from the saved contact list', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
        })

        const addContactButton = root.querySelector<HTMLButtonElement>(
            '[aria-label="Discover another contact"]',
        )
        const addContactTooltipId = addContactButton?.getAttribute('aria-describedby')
        const addContactTooltip = addContactTooltipId
            ? document.getElementById(addContactTooltipId)
            : null

        expect(addContactButton?.textContent?.trim()).toBe('+')
        expect(addContactTooltip?.getAttribute('role')).toBe('tooltip')
        expect(addContactTooltip?.textContent?.trim()).toBe('Find new')
        expect(addContactButton?.disabled).toBe(false)
        addContactButton?.click()

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(1)
            expect(root.querySelector('.work-updates')).not.toBeNull()
            expect(root.querySelector('.contact-history')).toBeNull()
            expect(root.querySelector('[aria-label="Discover another contact"]')).toBeNull()
        })
        expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('does not start discovery after leaving the apply view', async () => {
        let resolveContacts: ((response: Response) => void) | undefined
        const contactsResponse = new Promise<Response>((resolve) => {
            resolveContacts = resolve
        })
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }

            if (url.endsWith(`/api/job-posts/${posts[0]!.id}/outreach-contacts`)) {
                return contactsResponse
            }

            if (url.endsWith('/health')) {
                return Promise.resolve(
                    jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                )
            }

            if (url.endsWith('/tasks') && init?.method === 'POST') {
                return Promise.resolve(jsonResponse(runningWorkTask, 202))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

        const mounted = mountedApps.pop()

        if (mounted === undefined) {
            throw new Error('Could not find mounted apply view')
        }

        mounted.app.unmount()
        mounted.root.remove()
        resolveContacts?.(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/health'))).toBe(
            false,
        )
        expect(FakeEventSource.instances).toHaveLength(0)
    })

    it('ignores stale contact lookups when returning to the same post', async () => {
        const pendingLookups: Array<{
            postId: string
            resolve: (response: Response) => void
        }> = []
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }

            const post = posts.find(({ id }) =>
                url.endsWith(`/api/job-posts/${id}/outreach-contacts`),
            )

            if (post !== undefined) {
                return new Promise<Response>((resolve) => {
                    pendingLookups.push({ postId: post.id, resolve })
                })
            }

            if (url.endsWith('/health')) {
                return Promise.resolve(
                    jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                )
            }

            if (url.endsWith('/tasks') && init?.method === 'POST') {
                return Promise.resolve(jsonResponse(runningWorkTask, 202))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()
        await vi.waitFor(() => expect(pendingLookups).toHaveLength(1))

        findButton(root, 'P2 Engineer').click()
        await nextTick()
        findButton(root, "Discover contact's").click()
        await vi.waitFor(() => expect(pendingLookups).toHaveLength(2))

        findButton(root, 'P1 Engineer').click()
        await nextTick()
        findButton(root, "Discover contact's").click()
        await vi.waitFor(() => expect(pendingLookups).toHaveLength(3))

        expect(pendingLookups.map(({ postId }) => postId)).toEqual([
            posts[0]!.id,
            posts[1]!.id,
            posts[0]!.id,
        ])

        pendingLookups[0]!.resolve(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/health'))).toBe(
            false,
        )
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(findButton(root, "Discover contact's").disabled).toBe(true)

        pendingLookups[2]!.resolve(jsonResponse([savedContact]))

        await vi.waitFor(() => {
            expect(
                root.querySelector('[aria-label="Open outreach draft for Grace Hopper"]'),
            ).not.toBeNull()
        })
        expect(fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/health'))).toBe(
            false,
        )
        expect(FakeEventSource.instances).toHaveLength(0)

        pendingLookups[1]!.resolve(jsonResponse([]))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(
            root.querySelector('[aria-label="Open outreach draft for Grace Hopper"]'),
        ).not.toBeNull()
        expect(FakeEventSource.instances).toHaveLength(0)
    })

    it('navigates a first discovery with cancel available only in the stream', async () => {
        let resolveContacts: ((response: Response) => void) | undefined
        const contactsResponse = new Promise<Response>((resolve) => {
            resolveContacts = resolve
        })
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/apply-queue')) {
                return Promise.resolve(jsonResponse(applyQueueItems))
            }

            if (url.endsWith(`/api/job-posts/${posts[0]!.id}/outreach-contacts`)) {
                return contactsResponse
            }

            if (url.endsWith('/health')) {
                return Promise.resolve(
                    jsonResponse({ status: 'healthy', capabilities: ['chrome'] }),
                )
            }

            if (url.endsWith('/tasks') && init?.method === 'POST') {
                return Promise.resolve(jsonResponse(runningWorkTask, 202))
            }

            throw new Error(`Unexpected request: ${url}`)
        })
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        const discoverButton = findButton(root, "Discover contact's")
        discoverButton.click()

        await vi.waitFor(() => {
            expect(
                fetchMock.mock.calls.some(([input]) =>
                    fetchUrl(input).endsWith(`/api/job-posts/${posts[0]!.id}/outreach-contacts`),
                ),
            ).toBe(true)
        })

        expect(root.querySelector('.apply-job-post-view')?.classList.contains('is-active')).toBe(
            true,
        )
        expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(false)

        resolveContacts?.(jsonResponse([]))

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(1)
            expect(root.querySelector('[aria-label="Back to saved contacts"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).not.toBeNull()
            expect(root.querySelector('.work-updates')).not.toBeNull()
            expect(root.querySelector('.contact-history')).toBeNull()
            expect(root.querySelector('.contact-card')).toBeNull()
        })
        expect(discoverButton.querySelector('.outreach-spinner')).toBeNull()
        const outreachPanel = root.querySelector('section[aria-label="Outreach"]')
        const cancelButton = root.querySelector('[aria-label="Cancel outreach task"]')

        expect(cancelButton?.parentElement).toBe(outreachPanel)
        expect(outreachPanel?.lastElementChild).toBe(cancelButton)

        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()

        await vi.waitFor(() => {
            const addContactButton = root.querySelector<HTMLButtonElement>(
                '[aria-label="Discover another contact"]',
            )

            expect(root.querySelector('[aria-label="View outreach progress"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(root.querySelector('.work-updates')).toBeNull()
            expect(root.querySelectorAll('.contact-spinner')).toHaveLength(1)
            expect(addContactButton?.textContent?.trim()).toBe('+')
            expect(addContactButton?.disabled).toBe(true)
        })
        expect(fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/cancel'))).toBe(
            false,
        )

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job post"]')?.click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-active'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                false,
            )
            expect(discoverButton.disabled).toBe(false)
        })

        discoverButton.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('.contact-history')).not.toBeNull()
        })
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect(FakeEventSource.instances).toHaveLength(1)

        root.querySelector<HTMLButtonElement>('[aria-label="View outreach progress"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.work-updates')).not.toBeNull()
            expect(root.querySelector('.contact-history')).toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).not.toBeNull()
        })
    })

    it('discovers a contact and requests a draft revision for the selected post', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse(discoveredContact, 201))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P2 Engineer').click()
        const discoverButton = findButton(root, "Discover contact's")
        discoverButton.click()

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(1)
            expect(discoverButton.disabled).toBe(true)
            expect(discoverButton.getAttribute('aria-busy')).toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).not.toBeNull()
        })
        const taskRequest = fetchMock.mock.calls[3]
        const taskBody = (taskRequest?.[1] as RequestInit | undefined)?.body

        expect(typeof taskBody).toBe('string')

        const taskInput = JSON.parse(taskBody as string) as {
            prompt: string
        }

        expect(taskRequest?.[0]).toBe('http://localhost:3001/tasks')
        expect(taskInput.prompt).toContain('P2 Engineer')
        expect(taskInput.prompt).not.toContain('P1 Engineer')

        const source = FakeEventSource.instances[0]!
        expect(source.url).toBe(`http://localhost:3001/tasks/${runningWorkTask.id}/events`)

        source.message({
            type: 'completed',
            output: {
                personName: 'Ada Lovelace',
                personTitle: 'Engineering Manager',
                profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
                relevanceRationale:
                    'Their Engineering Manager title aligns with this role, and their platform leadership gives them direct context on the team, its priorities, and the day-to-day work.',
                draftMessage: 'Hi Ada, I would value your perspective on the P2 Engineer role.',
            },
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        await vi.waitFor(() => {
            expect(
                root.querySelector<HTMLTextAreaElement>('[aria-label="Outreach message"]')?.value,
            ).toBe('Hi Ada, I would value your perspective on the P2 Engineer role.')
            expect(root.querySelector('.work-updates')).toBeNull()
        })
        expect(fetchMock).toHaveBeenNthCalledWith(
            5,
            `http://localhost:3000/api/job-posts/${posts[1]!.id}/outreach-contacts`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personName: discoveredContact.personName,
                    personTitle: discoveredContact.personTitle,
                    profileUrl: discoveredContact.profileUrl,
                    relevanceRationale: discoveredContact.relevanceRationale,
                    draftMessage: discoveredContact.draftMessage,
                }),
            },
        )

        const draft = root.querySelector<HTMLTextAreaElement>('[aria-label="Outreach message"]')
        const request = root.querySelector<HTMLTextAreaElement>('#draft-request')

        if (draft === null || request === null) {
            throw new Error('Could not find outreach draft fields')
        }

        expect(draft.compareDocumentPosition(request) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
            0,
        )

        draft.value = 'Hi Ada, could I ask about the engineering team?'
        draft.dispatchEvent(new Event('input'))
        request.value = 'Make this warmer without making it longer.'
        request.dispatchEvent(new Event('input'))

        const revisionTask = {
            ...runningWorkTask,
            id: '2ab5f86e-b2f8-47ed-a4bc-31f7891eae2f',
            threadId: 'revision-thread-id',
            turnId: 'revision-turn-id',
        }
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(revisionTask, 202))

        const sendButton = root.querySelector<HTMLButtonElement>('[aria-label="Send request"]')

        if (sendButton === null) {
            throw new Error('Could not find outreach send button')
        }

        await vi.waitFor(() => expect(sendButton.disabled).toBe(false))
        sendButton.click()

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(2)
        })
        const revisionRequest = fetchMock.mock.calls[6]
        const revisionBody = (revisionRequest?.[1] as RequestInit | undefined)?.body

        expect(typeof revisionBody).toBe('string')

        const revisionInput = JSON.parse(revisionBody as string) as {
            prompt: string
        }

        expect(revisionInput.prompt).toContain('Hi Ada, could I ask about the engineering team?')
        expect(revisionInput.prompt).toContain('Make this warmer without making it longer.')

        FakeEventSource.instances[1]!.message({
            type: 'completed',
            output: {
                draftMessage: 'Hi Ada, I would love to hear about the engineering team.',
                response: 'I made the opening warmer and kept it concise.',
            },
            createdAt: '2026-07-18T12:00:02.000Z',
        })

        await vi.waitFor(() => {
            expect(
                root.querySelector<HTMLTextAreaElement>('[aria-label="Outreach message"]')?.value,
            ).toBe('Hi Ada, I would love to hear about the engineering team.')
            expect(root.textContent).toContain('I made the opening warmer and kept it concise.')
        })
    })

    it('shows and resolves a required LinkedIn permission without starting another task', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        const source = FakeEventSource.instances[0]!
        source.message(linkedInActionRequired)

        await vi.waitFor(() => {
            expect(root.textContent).toContain('Action required')
            expect(root.textContent).toContain('Allow Chrome to access https://www.linkedin.com?')
            expect(root.querySelector('textarea')).toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).not.toBeNull()
            expect(root.querySelector('.action-required')).toBe(document.activeElement)
        })

        const allowButton = findButton(root, 'Allow')

        expect(allowButton.textContent?.trim()).toBe('Allow')
        allowButton.click()

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                5,
                `http://localhost:3001/tasks/${runningWorkTask.id}/actions/${linkedInActionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'approve' }),
                },
            )
        })
        expect(FakeEventSource.instances).toHaveLength(1)

        source.message({
            type: 'action-resolved',
            actionId: linkedInActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        await vi.waitFor(() => {
            expect(root.textContent).not.toContain('Allow Chrome to access')
        })
    })

    it('always allows later websites for the current task without another prompt', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        const source = FakeEventSource.instances[0]!
        source.message(linkedInActionRequired)

        await vi.waitFor(() => {
            expect(root.textContent).toContain(linkedInActionRequired.action.message)
        })
        const alwaysAllow = findButton(root, 'Always allow for this task')
        const decline = findButton(root, 'Decline')
        const actionButtons = root.querySelector('.action-buttons')

        expect(alwaysAllow.classList.contains('action-button')).toBe(true)
        expect(alwaysAllow.classList.contains('action-button-primary')).toBe(false)
        expect(decline.classList.contains('action-button')).toBe(true)
        expect(alwaysAllow.disabled).toBe(false)
        expect(
            alwaysAllow.compareDocumentPosition(actionButtons ?? document.body) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).not.toBe(0)
        alwaysAllow.click()

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alertdialog"]')).not.toBeNull()
            expect(root.textContent).toContain('Always allow for this task?')
            expect(root.textContent).toContain(
                'Chrome will be allowed to access every website this task visits without asking again.',
            )
            expect(root.textContent).not.toContain(linkedInActionRequired.action.message)
            expect(findButton(root, 'No')).toBe(document.activeElement)
        })
        expect(fetchMock).toHaveBeenCalledTimes(4)

        findButton(root, 'No').click()

        await vi.waitFor(() => {
            expect(findButton(root, 'Always allow for this task')).toBe(document.activeElement)
            expect(root.textContent).toContain(linkedInActionRequired.action.message)
        })
        expect(fetchMock).toHaveBeenCalledTimes(4)

        findButton(root, 'Always allow for this task').click()
        await vi.waitFor(() => expect(findButton(root, 'No')).toBe(document.activeElement))
        findButton(root, 'Yes').click()

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                5,
                `http://localhost:3001/tasks/${runningWorkTask.id}/actions/${linkedInActionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'approve' }),
                },
            )
            expect(root.textContent).not.toContain(linkedInActionRequired.action.message)
        })

        source.message({
            type: 'action-resolved',
            actionId: linkedInActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })
        source.message(exampleActionRequired)

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                6,
                `http://localhost:3001/tasks/${runningWorkTask.id}/actions/${exampleActionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision: 'approve' }),
                },
            )
            expect(root.textContent).not.toContain(exampleActionRequired.action.message)
            expect(root.textContent).not.toContain('Action required')
        })
        expect(FakeEventSource.instances).toHaveLength(1)
    })

    it('returns to a website prompt when automatic approval fails', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        const source = FakeEventSource.instances[0]!
        source.message(linkedInActionRequired)

        await vi.waitFor(() => {
            expect(root.textContent).toContain(linkedInActionRequired.action.message)
        })
        findButton(root, 'Always allow for this task').click()
        await vi.waitFor(() => expect(findButton(root, 'No')).toBe(document.activeElement))
        findButton(root, 'Yes').click()
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
        source.message({
            type: 'action-resolved',
            actionId: linkedInActionId,
            createdAt: '2026-07-18T12:00:01.000Z',
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()
        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
        })

        source.message(exampleActionRequired)

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(6)
            expect(root.querySelector('.contact-history')).toBeNull()
            expect(root.querySelector('.work-updates')).not.toBeNull()
            expect(root.textContent).toContain(exampleActionRequired.action.message)
            expect(root.querySelector('[role="alert"]')?.textContent).toBe(
                'Work request failed (500)',
            )
        })

        expect(findButton(root, 'Always allow for this task').disabled).toBe(false)
        expect(findButton(root, 'Decline').disabled).toBe(false)
        expect(findButton(root, 'Allow').disabled).toBe(false)
    })

    it('returns to a website prompt when manual approval fails after navigating back', async () => {
        let resolveActionResponse: ((response: Response) => void) | undefined
        const actionResponse = new Promise<Response>((resolve) => {
            resolveActionResponse = resolve
        })
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockReturnValueOnce(actionResponse)
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        FakeEventSource.instances[0]!.message(linkedInActionRequired)

        await vi.waitFor(() => {
            expect(root.textContent).toContain(linkedInActionRequired.action.message)
        })
        findButton(root, 'Allow').click()
        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
        })
        resolveActionResponse?.(jsonResponse({}, 500))

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).toBeNull()
            expect(root.querySelector('.work-updates')).not.toBeNull()
            expect(root.textContent).toContain(linkedInActionRequired.action.message)
            expect(root.querySelector('[role="alert"]')?.textContent).toBe(
                'Work request failed (500)',
            )
        })
        expect(findButton(root, 'Decline').disabled).toBe(false)
        expect(findButton(root, 'Allow').disabled).toBe(false)
    })

    it('keeps a pending outreach action available after the Apply view remounts', async () => {
        let resolveQueueResponse: ((response: Response) => void) | undefined
        const queueResponse = new Promise<Response>((resolve) => {
            resolveQueueResponse = resolve
        })
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockReturnValueOnce(queueResponse)
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const root = await mountApplyView(pinia)

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        FakeEventSource.instances[0]!.message(linkedInActionRequired)

        const mounted = mountedApps.pop()!
        mounted.app.unmount()
        mounted.root.remove()

        const remountedRoot = await mountApplyView(pinia, { waitForPosts: false })
        const labelPicker = remountedRoot.querySelector<HTMLButtonElement>(
            'button[aria-label="Job post label"]',
        )

        expect(labelPicker).not.toBeNull()
        expect(labelPicker?.disabled).toBe(true)

        resolveQueueResponse?.(jsonResponse(applyQueueItems))

        await vi.waitFor(() => {
            expect(remountedRoot.textContent).toContain('Allow Chrome to access')
            expect(
                remountedRoot.querySelector('.apply-outreach')?.classList.contains('is-active'),
            ).toBe(true)
            expect(remountedRoot.querySelector('.action-required')).toBe(document.activeElement)
            expect(labelPicker?.disabled).toBe(false)
        })
    })

    it('keeps a newly applied post visible for the current route visit', async () => {
        const appliedPost = {
            ...posts[0]!,
            applicationStatus: 'awaiting-response' as const,
            updatedAt: '2026-07-16T12:00:01.000Z',
        }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(
                jsonResponse({
                    post: appliedPost,
                    inApplyQueue: false,
                }),
            )
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        const { items, trigger: labelPicker } = await openJobPostActions(root)

        expect(items.map(({ textContent }) => textContent?.trim())).toContain('Applied')
        items.find(({ textContent }) => textContent?.trim() === 'Applied')?.click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('.apply-job-post-view .user-label')?.textContent?.trim(),
            ).toBe('applied')
            expect(root.textContent).toContain('P1 Engineer')
            expect(labelPicker.disabled).toBe(true)
        })
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3000/api/job-posts/${posts[0]!.id}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationStatus: 'awaiting-response' }),
            },
        )

        findButton(root, 'P2 Engineer').click()

        await vi.waitFor(() => {
            expect(root.textContent).toContain('P1 Engineer')
            expect(root.textContent).toContain('P2 Engineer')
        })

        expect(root.textContent).not.toContain('Undo')
    })

    it('keeps an unapplied post available when its status update fails', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse([createApplyQueueItem(posts[0]!)]))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        const labelPicker = await chooseJobPostAction(root, 'Applied')

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')?.textContent).toBe(
                'API request failed (500)',
            )
            expect(labelPicker.disabled).toBe(false)
            expect(root.textContent).toContain('P1 Engineer')
        })
    })

    it('keeps the loaded list visible when a label update fails', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(applyQueueItems))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const root = await mountApplyView()
        await chooseJobPostAction(root, 'P2')

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')?.textContent).toBe(
                'API request failed (500)',
            )
        })

        expect(root.querySelector('.apply-post-list .card-list')).not.toBeNull()
    })

    it('removes a post from Apply after it is forgone', async () => {
        const forgonePost = {
            ...posts[0]!,
            userLabel: 'forgo' as const,
            updatedAt: '2026-07-16T12:00:01.000Z',
        }
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse([createApplyQueueItem(posts[0]!)]))
            .mockResolvedValueOnce(
                jsonResponse({
                    post: forgonePost,
                    inApplyQueue: false,
                }),
            )
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        await chooseJobPostAction(root, 'forgo')

        await vi.waitFor(() => {
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('.apply-job-post-view')).toBeNull()
            expect(root.textContent).toContain('No job posts match this filter.')
        })
    })
})
