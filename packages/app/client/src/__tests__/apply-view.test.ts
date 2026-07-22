/** @vitest-environment jsdom */

import type {
    JobPost,
    OutreachContact,
    UserLabel,
    WorkTaskEvent,
} from '@job-search-facilitator/core'
import { createPinia, type Pinia } from 'pinia'
import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplyView from '../views/ApplyView.vue'

const createPost = (id: string, userLabel: UserLabel): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle: `${userLabel} Engineer`,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    postUrl: `https://example.com/jobs/${id}`,
    applicationUrl: `https://apply.example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel,
    archivedAt: null,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
})

const posts = [
    createPost('post-p1', 'P1'),
    createPost('post-p2', 'P2'),
    createPost('post-quick-app', 'quick-app'),
]

const runningWorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const savedContact: OutreachContact = {
    id: 'contact-1',
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
    id: 'contact-2',
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

const mountApplyView = async (pinia: Pinia = createPinia()) => {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ApplyView)
    app.use(pinia)
    app.mount(root)
    mountedApps.push({ app, root })

    await vi.waitFor(() => expect(root.textContent).toContain('P1 Engineer'))

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
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(posts)))
    })

    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }

        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
        vi.unstubAllGlobals()
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

    it('moves between the post list and viewer', async () => {
        const root = await mountApplyView()
        const list = root.querySelector('.apply-post-list')
        const viewer = root.querySelector('.apply-job-post-view')

        expect(list?.classList.contains('is-active')).toBe(true)
        expect(list?.classList.contains('is-adjacent')).toBe(false)
        expect(viewer?.classList.contains('is-active')).toBe(false)
        expect(viewer?.classList.contains('is-adjacent')).toBe(true)

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
        expect(findButton(root, "Discover contact's")).not.toBeNull()

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(true)
            expect(list?.classList.contains('is-adjacent')).toBe(false)
            expect(viewer?.classList.contains('is-active')).toBe(false)
            expect(viewer?.classList.contains('is-adjacent')).toBe(true)
        })
    })

    it('opens saved contacts without starting another discovery', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
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
        })
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(fetchMock).toHaveBeenCalledTimes(2)

        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Grace Hopper"]',
        )?.click()

        await vi.waitFor(() => {
            expect(root.textContent).toContain('Messaged')
            expect(
                root.querySelector<HTMLTextAreaElement>('[aria-label="Outreach message"]')?.value,
            ).toBe(savedContact.draftMessage)
        })

        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
        })
        expect(FakeEventSource.instances).toHaveLength(0)
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('navigates back from an expanded draft through contacts to the job post', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
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
        let resolveContactSave: ((response: Response) => void) | undefined
        const contactSaveResponse = new Promise<Response>((resolve) => {
            resolveContactSave = resolve
        })
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockReturnValueOnce(contactSaveResponse)
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

        FakeEventSource.instances[0]!.message({
            type: 'completed',
            output: {
                personName: savedContact.personName,
                personTitle: savedContact.personTitle,
                profileUrl: savedContact.profileUrl,
                relevanceRationale: savedContact.relevanceRationale,
                draftMessage: savedContact.draftMessage,
            },
            createdAt: '2026-07-22T00:00:00.000Z',
        })

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()

        await vi.waitFor(() => {
            expect(
                root.querySelector<HTMLButtonElement>('[aria-label="Discover another contact"]')
                    ?.disabled,
            ).toBe(true)
        })

        resolveContactSave?.(jsonResponse(savedContact, 201))

        await vi.waitFor(() => {
            expect(
                root.querySelector<HTMLButtonElement>('[aria-label="Discover another contact"]')
                    ?.disabled,
            ).toBe(false)
        })
    })

    it('does not start discovery after leaving the apply view', async () => {
        let resolveContacts: ((response: Response) => void) | undefined
        const contactsResponse = new Promise<Response>((resolve) => {
            resolveContacts = resolve
        })
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/labeled')) {
                return Promise.resolve(jsonResponse(posts))
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

            if (url.endsWith('/api/job-posts/labeled')) {
                return Promise.resolve(jsonResponse(posts))
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
        const cancelledTask = { ...runningWorkTask, status: 'cancelled' as const }
        let resolveContacts: ((response: Response) => void) | undefined
        const contactsResponse = new Promise<Response>((resolve) => {
            resolveContacts = resolve
        })
        const fetchMock = vi.mocked(fetch).mockReset()
        fetchMock.mockImplementation((input, init) => {
            const url = fetchUrl(input)

            if (url.endsWith('/api/job-posts/labeled')) {
                return Promise.resolve(jsonResponse(posts))
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

            if (url.endsWith(`/tasks/${runningWorkTask.id}/cancel`)) {
                return Promise.resolve(jsonResponse(cancelledTask, 202))
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

        root.querySelector<HTMLButtonElement>('[aria-label="Cancel outreach task"]')?.click()

        await vi.waitFor(() => {
            expect(
                fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/cancel')),
            ).toBe(true)
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
            expect(root.querySelector('.contact-history')).toBeNull()
        })
    })

    it('finds a relevant outreach contact for the selected job post', async () => {
        const fetchMock = vi.mocked(fetch)
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        })
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
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
            outputSchema: { required: string[] }
            capabilities: string[]
        }

        expect(taskRequest?.[0]).toBe('http://localhost:3001/tasks')
        expect(taskInput.prompt).toContain('Example Co')
        expect(taskInput.prompt).toContain('P2 Engineer')
        expect(taskInput.prompt).toContain('https://example.com/jobs/post-p2')
        expect(taskInput.prompt).not.toContain('P1 Engineer')
        expect(taskInput.prompt).toContain('People')
        expect(taskInput.prompt).toContain('likely hiring manager or team lead')
        expect(taskInput.prompt).toContain('not simply the first result')
        expect(taskInput.prompt).toContain('docs/agents/job-search-user-info.md')
        expect(taskInput.prompt).toContain('truthful first outreach message')
        expect(taskInput.outputSchema.required).toEqual([
            'personName',
            'personTitle',
            'profileUrl',
            'relevanceRationale',
            'draftMessage',
        ])
        expect(taskInput.capabilities).toEqual(['chrome'])

        const source = FakeEventSource.instances[0]!
        expect(source.url).toBe(`http://localhost:3001/tasks/${runningWorkTask.id}/events`)

        source.message({
            type: 'activity',
            message: 'Task started',
            createdAt: '2026-07-18T11:59:59.000Z',
        })
        source.message({
            type: 'activity',
            message: 'Using Chrome',
            createdAt: '2026-07-18T12:00:00.000Z',
        })
        source.message({
            type: 'message',
            textDelta: 'I am reviewing the ',
            startsNewStatement: true,
            createdAt: '2026-07-18T12:00:00.100Z',
        })
        source.message({
            type: 'message',
            textDelta: 'hiring team.',
            startsNewStatement: false,
            createdAt: '2026-07-18T12:00:00.200Z',
        })

        await vi.waitFor(() => {
            expect(root.querySelector('.activity-icon-tool')).not.toBeNull()
            expect(root.querySelector('.activity-icon-globe')).toBeNull()
            expect(root.textContent).toContain('I am reviewing the hiring team.')
            expect(root.querySelectorAll('.activity-progress')).toHaveLength(1)
            expect(root.querySelector('.activity-item-activity .activity-progress')).not.toBeNull()
            expect(root.querySelector('.activity-item-commentary .activity-progress')).toBeNull()
        })

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
            expect(root.textContent).toContain('Ada Lovelace')
            expect(root.textContent).toContain('Engineering Manager')
            expect(root.textContent).toContain(
                'Their Engineering Manager title aligns with this role, and their platform leadership',
            )
            expect(root.querySelector<HTMLAnchorElement>('.person-name')?.href).toBe(
                'https://www.linkedin.com/in/ada-lovelace',
            )
            expect(
                root.querySelector<HTMLTextAreaElement>('[aria-label="Outreach message"]')?.value,
            ).toBe('Hi Ada, I would value your perspective on the P2 Engineer role.')
            expect(root.querySelector('label[for="outreach-message"]')).toBeNull()
            expect(root.querySelector('.work-updates')).toBeNull()
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
            expect(root.querySelector('[aria-label="Back to saved contacts"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Expand panel"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Back to job posts"]')).not.toBeNull()
            expectButtonTooltip(root, 'Back to saved contacts')
            expectButtonTooltip(root, 'Back to job posts')
            expect(
                root.querySelector('[aria-label="Back to job posts"] .back-button-icon'),
            ).not.toBeNull()
            expect(discoverButton.disabled).toBe(false)
            expect(discoverButton.getAttribute('aria-busy')).toBeNull()
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-active')).toBe(
                false,
            )
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
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

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
        window.dispatchEvent(new Event('resize'))
        expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
        expect(root.querySelector('[aria-label="Back to saved contacts"]')).not.toBeNull()

        const rationale = root.querySelector<HTMLElement>('.relevance-rationale')
        const rationaleToggle = findButton(root, 'Show more')
        const expandControl = root.querySelector<HTMLButtonElement>('[aria-label="Expand panel"]')

        expect(rationale?.classList.contains('is-clamped')).toBe(true)
        expect(rationaleToggle.closest('.rationale-copy')).not.toBeNull()
        expect(rationaleToggle.getAttribute('aria-expanded')).toBe('false')
        expect(expandControl?.classList.contains('panel-control-expand')).toBe(true)
        const expandTooltipId = expandControl?.getAttribute('aria-describedby')
        const expandTooltip = expandTooltipId ? document.getElementById(expandTooltipId) : null

        expect(expandTooltip?.getAttribute('role')).toBe('tooltip')
        expect(expandTooltip?.textContent).toContain('Expand panel')
        expect(
            [...(expandControl?.querySelectorAll('polyline') ?? [])].map((chevron) =>
                chevron.getAttribute('points'),
            ),
        ).toEqual(['11 7 5 5 7 11', '13 17 19 19 17 13'])
        rationaleToggle.click()

        await vi.waitFor(() => {
            expect(rationale?.classList.contains('is-clamped')).toBe(false)
            expect(rationaleToggle.textContent).toContain('Show less')
            expect(rationaleToggle.getAttribute('aria-expanded')).toBe('true')
        })

        const copyButton = root.querySelector<HTMLButtonElement>(
            '[aria-label="Copy outreach message"]',
        )

        if (copyButton === null) {
            throw new Error('Could not find outreach copy button')
        }

        expect(copyButton.closest('.draft-field')).not.toBeNull()
        expect(copyButton.querySelector('.copy-icon')?.tagName.toLowerCase()).toBe('svg')
        expect(copyButton.getAttribute('aria-describedby')).toBeNull()
        copyButton.click()
        await vi.waitFor(() => {
            expect(writeText).toHaveBeenCalledExactlyOnceWith(
                'Hi Ada, I would value your perspective on the P2 Engineer role.',
            )
            const feedbackId = copyButton.getAttribute('aria-describedby')
            const feedback = feedbackId ? document.getElementById(feedbackId) : null

            expect(feedback?.getAttribute('role')).toBe('status')
            expect(feedback?.classList.contains('copy-feedback-copied')).toBe(true)
            expect(feedback?.textContent).toContain('Copied')
            expect(copyButton.getAttribute('aria-label')).toBe('Outreach message copied')
        })

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
        let resolveRevisionHealth: ((response: Response) => void) | undefined
        const revisionHealth = new Promise<Response>((resolve) => {
            resolveRevisionHealth = resolve
        })
        fetchMock
            .mockReturnValueOnce(revisionHealth)
            .mockResolvedValueOnce(jsonResponse(revisionTask, 202))

        const sendButton = root.querySelector<HTMLButtonElement>('[aria-label="Send request"]')

        if (sendButton === null) {
            throw new Error('Could not find outreach send button')
        }

        await vi.waitFor(() => expect(sendButton.disabled).toBe(false))
        expect(sendButton.closest('.request-field')).not.toBeNull()
        expect(sendButton.querySelector('.send-icon')?.tagName.toLowerCase()).toBe('svg')
        expect(sendButton.querySelector('.loading-spinner')).toBeNull()
        sendButton.click()
        await nextTick()

        expect(sendButton.disabled).toBe(true)
        expect(sendButton.getAttribute('aria-busy')).toBe('true')
        expect(sendButton.querySelector('.send-icon')).toBeNull()
        expect(sendButton.querySelector('.send-spinner')).not.toBeNull()

        resolveRevisionHealth?.(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))

        await vi.waitFor(() => {
            expect(FakeEventSource.instances).toHaveLength(2)
            expect(sendButton.disabled).toBe(true)
            expect(sendButton.getAttribute('aria-busy')).toBe('true')
            expect(sendButton.querySelector('.send-icon')).toBeNull()
            expect(sendButton.querySelector('.loading-spinner')).not.toBeNull()
        })
        const revisionRequest = fetchMock.mock.calls[6]
        const revisionBody = (revisionRequest?.[1] as RequestInit | undefined)?.body

        expect(typeof revisionBody).toBe('string')

        const revisionInput = JSON.parse(revisionBody as string) as {
            prompt: string
            outputSchema: { required: string[] }
            capabilities: string[]
        }

        expect(revisionInput.prompt).toContain('P2 Engineer')
        expect(revisionInput.prompt).toContain('Ada Lovelace')
        expect(revisionInput.prompt).toContain('Hi Ada, could I ask about the engineering team?')
        expect(revisionInput.prompt).toContain('Make this warmer without making it longer.')
        expect(revisionInput.prompt).toContain('asks a question')
        expect(revisionInput.outputSchema.required).toEqual(['draftMessage', 'response'])
        expect(revisionInput.capabilities).toEqual([])

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
            expect(root.querySelector<HTMLElement>('.draft-board')?.style.display).not.toBe('none')
            expect(root.querySelector('[aria-label="Expand panel"]')).not.toBeNull()
            expect(sendButton.getAttribute('aria-busy')).toBeNull()
            expect(sendButton.querySelector('.loading-spinner')).toBeNull()
            expect(sendButton.querySelector('.send-icon')?.tagName.toLowerCase()).toBe('svg')
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Expand panel"]')?.click()

        await vi.waitFor(() => {
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(false)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('.draft-board')?.classList.contains('is-expanded')).toBe(true)
            expect(root.querySelector('[aria-label="Collapse panel"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Show selected job post"]')).toBeNull()
            expect(
                root
                    .querySelector('section[aria-label="Outreach"]')
                    ?.querySelectorAll('.back-button'),
            ).toHaveLength(1)
            expect(root.querySelector('.rationale-toggle')).toBeNull()
            expect(
                root.querySelector('.relevance-rationale')?.classList.contains('is-clamped'),
            ).toBe(false)
        })

        const collapseControl = root.querySelector<HTMLButtonElement>(
            '[aria-label="Collapse panel"]',
        )
        const collapseTooltipId = collapseControl?.getAttribute('aria-describedby')

        expect(document.getElementById(collapseTooltipId ?? '')?.textContent).toContain(
            'Collapse panel',
        )

        collapseControl?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.draft-board')?.classList.contains('is-expanded')).toBe(
                false,
            )
            expect(root.querySelector('[aria-label="Expand panel"]')).not.toBeNull()
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(findButton(root, 'Show more')).not.toBeNull()
            expect(
                root.querySelector('.relevance-rationale')?.classList.contains('is-clamped'),
            ).toBe(true)
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to saved contacts"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.contact-history')).not.toBeNull()
            expect(root.querySelector('[aria-label="Back to job post"]')).not.toBeNull()
            expect(root.querySelector('[aria-label="Back to saved contacts"]')).toBeNull()
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job post"]')?.click()

        await vi.waitFor(() => {
            const backToJobPosts = root.querySelector('[aria-label="Back to job posts"]')

            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-active'),
            ).toBe(true)
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-adjacent')).toBe(
                false,
            )
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-adjacent')).toBe(
                true,
            )
            expect(backToJobPosts).not.toBeNull()
            expect(backToJobPosts?.closest('.back-button-mobile-only')).not.toBeNull()
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() => {
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(
                root.querySelector('.apply-job-post-view')?.classList.contains('is-adjacent'),
            ).toBe(true)
            expect(root.querySelector('[aria-label="Back to job posts"]')).toBeNull()
        })
    })

    it('cancels an active outreach task without using panel navigation', async () => {
        const cancelledTask = { ...runningWorkTask, status: 'cancelled' as const }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse(cancelledTask, 202))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        expect(root.textContent).not.toContain('Message draft')
        root.querySelector<HTMLButtonElement>('[aria-label="Cancel outreach task"]')?.click()

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenNthCalledWith(
                5,
                `http://localhost:3001/tasks/${runningWorkTask.id}/cancel`,
                { method: 'POST' },
            )
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).toBeNull()
            expect(root.querySelector('[aria-label="Back to saved contacts"]')).not.toBeNull()
        })

        expect(FakeEventSource.instances[0]!.close).toHaveBeenCalledOnce()
    })

    it('keeps an active outreach task visible when cancellation fails', async () => {
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource)
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()
        findButton(root, "Discover contact's").click()

        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
        root.querySelector<HTMLButtonElement>('[aria-label="Cancel outreach task"]')?.click()

        await vi.waitFor(() => {
            const issue = root.querySelector('[role="alert"]')

            expect(issue?.textContent).toBe('Work request failed (500)')
            expect(root.querySelector('.apply-outreach')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('[aria-label="Cancel outreach task"]')).not.toBeNull()
            expect(issue).toBe(document.activeElement)
        })
    })

    it('shows and resolves a required LinkedIn permission without starting another task', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
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
            .mockResolvedValueOnce(jsonResponse(posts))
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
            .mockResolvedValueOnce(jsonResponse(posts))
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
            .mockResolvedValueOnce(jsonResponse(posts))
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
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(runningWorkTask, 202))
            .mockResolvedValueOnce(jsonResponse(posts))
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

        const remountedRoot = await mountApplyView(pinia)

        await vi.waitFor(() => {
            expect(remountedRoot.textContent).toContain('Allow Chrome to access')
            expect(
                remountedRoot.querySelector('.apply-outreach')?.classList.contains('is-active'),
            ).toBe(true)
            expect(remountedRoot.querySelector('.action-required')).toBe(document.activeElement)
        })
    })

    it('keeps a newly applied post visible for the current route visit', async () => {
        const appliedPost = { ...posts[0]!, applicationStatus: 'awaiting-response' as const }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse(appliedPost))
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
            'http://localhost:3000/api/job-posts/post-p1',
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
            .mockResolvedValueOnce(jsonResponse([posts[0]]))
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
            .mockResolvedValueOnce(jsonResponse(posts))
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
        const forgonePost = { ...posts[0]!, userLabel: 'forgo' as const }
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse([posts[0]]))
            .mockResolvedValueOnce(jsonResponse(forgonePost))
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
