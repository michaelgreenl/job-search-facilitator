import type { JobPost, JobSearchReport, OutreachContact } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOutreachStore } from '../stores/outreach.store'
import { usePostStore } from '../stores/post.store'
import { useReportStore } from '../stores/report.store'

const post: JobPost = {
    id: 'post-1',
    sourceKey: 'example:post-1',
    roleTitle: 'Software Engineer',
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    postUrl: 'https://example.com/jobs/post-1',
    applicationUrl: 'https://apply.example.com/jobs/post-1',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
}

const savedContact: OutreachContact = {
    id: 'contact-1',
    jobPostId: post.id,
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale: 'Her title aligns with the role.',
    draftMessage: 'Initial draft',
    messaged: false,
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
}

const report: JobSearchReport = {
    id: 'report-1',
    reportDate: '2026-07-13',
    summary: 'One matching role',
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
    archivedAt: null,
    results: [
        {
            agentRank: 1,
            agentLabel: 'target',
            fitRationale: 'Strong TypeScript fit',
            applicationFlow: 'Direct application',
            keyLegitimacySignals: 'Listed on company careers page',
            recommendedResume: 'backend-full-stack',
            recommendedAction: 'Apply',
            legitimacyNotes: null,
            post,
        },
    ],
}

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

describe('report store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('loads same-day reports and refreshes one by id', async () => {
        const earlierReport = { ...report, id: 'report-2', summary: 'Earlier run' }
        const refreshedReport = { ...report, summary: 'Updated summary' }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse([report, earlierReport]))
            .mockResolvedValueOnce(jsonResponse(refreshedReport))
        const store = useReportStore()

        await store.fetchReports()
        await store.fetchReport(report.id)

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/job-search-reports',
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3000/api/job-search-reports/${report.id}`,
            undefined,
        )
        expect(store.reports).toEqual([refreshedReport, earlierReport])
    })

    it('exposes failed requests to the UI', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useReportStore()

        await expect(store.fetchReports()).rejects.toThrow('API request failed (500)')

        expect(store.error).toBe('API request failed (500)')
        expect(store.loading).toBe(false)
    })
})

describe('post store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('loads posts and keeps PATCH responses as the current post state', async () => {
        const secondPost = { ...post, id: 'post-2', sourceKey: 'example:post-2' }
        const updatedPost = {
            ...post,
            applicationStatus: 'awaiting-response' as const,
            userLabel: 'forgo' as const,
        }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse([post]))
            .mockResolvedValueOnce(jsonResponse(secondPost))
            .mockResolvedValueOnce(jsonResponse(updatedPost))
        const store = usePostStore()
        const reportStore = useReportStore()
        reportStore.reports = [report]

        await store.fetchPosts()
        await store.fetchPost(secondPost.id)
        await store.updatePost(post.id, {
            applicationStatus: 'awaiting-response',
            userLabel: 'forgo',
        })

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/job-posts',
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3000/api/job-posts/${secondPost.id}`,
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            `http://localhost:3000/api/job-posts/${post.id}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicationStatus: 'awaiting-response',
                    userLabel: 'forgo',
                }),
            },
        )
        expect(store.posts).toEqual([updatedPost, secondPost])
        expect(reportStore.reports[0]?.results[0]?.post).toEqual(updatedPost)
    })

    it('loads labeled posts from the dedicated endpoint', async () => {
        const labeledPost = { ...post, userLabel: 'P1' as const }
        const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([labeledPost]))
        const store = usePostStore()

        await store.fetchLabeledPosts()

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            'http://localhost:3000/api/job-posts/labeled',
            undefined,
        )
        expect(store.posts).toEqual([labeledPost])
    })
})

describe('outreach store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('updates the selected and saved contact from the messaged PATCH response', async () => {
        const updatedContact = {
            ...savedContact,
            messaged: true,
            updatedAt: '2026-07-22T12:00:00.000Z',
        }
        const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updatedContact))
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]
        store.selectContact(savedContact)
        store.draft = 'Locally edited draft'

        const update = store.updateContactMessaged(savedContact.id, true)

        expect(store.contactUpdating).toBe(true)
        await expect(update).resolves.toEqual(updatedContact)
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            `http://localhost:3000/api/job-posts/${post.id}/outreach-contacts/${savedContact.id}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messaged: true }),
            },
        )
        expect(store.contact).toEqual(updatedContact)
        expect(store.contacts).toEqual([updatedContact])
        expect(store.draft).toBe('Locally edited draft')
        expect(store.contactUpdating).toBe(false)
        expect(store.contactUpdateError).toBeNull()
    })

    it('keeps the saved status and exposes an error when the messaged update fails', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 500))
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]
        store.selectContact(savedContact)

        await expect(store.updateContactMessaged(savedContact.id, true)).rejects.toThrow(
            'API request failed (500)',
        )

        expect(store.contact).toEqual(savedContact)
        expect(store.contacts).toEqual([savedContact])
        expect(store.contactUpdating).toBe(false)
        expect(store.contactUpdateError).toBe('API request failed (500)')
    })

    it('ignores a messaged update after outreach moves to another post', async () => {
        let resolveUpdate: ((response: Response) => void) | undefined
        const updateResponse = new Promise<Response>((resolve) => {
            resolveUpdate = resolve
        })
        vi.mocked(fetch).mockReturnValueOnce(updateResponse)
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]
        store.selectContact(savedContact)

        const update = store.updateContactMessaged(savedContact.id, true)
        store.openForPost('post-2')
        resolveUpdate?.(jsonResponse({ ...savedContact, messaged: true }))

        await expect(update).resolves.toBeNull()
        expect(store.postId).toBe('post-2')
        expect(store.contact).toBeNull()
        expect(store.contacts).toEqual([])
        expect(store.contactUpdating).toBe(false)
        expect(store.contactUpdateError).toBeNull()
    })

    it('does not replace an edited draft with a completed task that was already applied', async () => {
        const store = useOutreachStore()
        const output = {
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            relevanceRationale: 'Her title aligns with the role.',
            draftMessage: 'Initial draft',
        }
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse({
                id: 'contact-1',
                jobPostId: post.id,
                ...output,
                messaged: false,
                createdAt: '2026-07-21T12:00:00.000Z',
                updatedAt: '2026-07-21T12:00:00.000Z',
            }),
        )

        store.beginDiscovery(post.id)
        await store.applyTaskResult(output)
        store.draft = 'Edited draft'
        await store.applyTaskResult(output)

        expect(store.draft).toBe('Edited draft')
    })

    it('loads saved contacts and persists a completed discovery', async () => {
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse(savedContact, 201))
        const store = useOutreachStore()

        store.beginDiscovery(post.id)
        await store.fetchContacts(post.id)
        const completedContact = await store.applyTaskResult({
            personName: savedContact.personName,
            personTitle: savedContact.personTitle,
            profileUrl: savedContact.profileUrl,
            relevanceRationale: savedContact.relevanceRationale,
            draftMessage: savedContact.draftMessage,
        })

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            `http://localhost:3000/api/job-posts/${post.id}/outreach-contacts`,
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `http://localhost:3000/api/job-posts/${post.id}/outreach-contacts`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personName: savedContact.personName,
                    personTitle: savedContact.personTitle,
                    profileUrl: savedContact.profileUrl,
                    relevanceRationale: savedContact.relevanceRationale,
                    draftMessage: savedContact.draftMessage,
                }),
            },
        )
        expect(completedContact).toEqual(savedContact)
        expect(store.contacts).toEqual([savedContact])
    })

    it('ignores a completed discovery save after outreach moves to another post', async () => {
        const nextPostId = 'post-2'
        let resolveSave: ((response: Response) => void) | undefined
        const saveResponse = new Promise<Response>((resolve) => {
            resolveSave = resolve
        })
        vi.mocked(fetch).mockReturnValueOnce(saveResponse)
        const store = useOutreachStore()

        store.beginDiscovery(post.id)
        const completedContact = store.applyTaskResult({
            personName: savedContact.personName,
            personTitle: savedContact.personTitle,
            profileUrl: savedContact.profileUrl,
            relevanceRationale: savedContact.relevanceRationale,
            draftMessage: savedContact.draftMessage,
        })
        store.beginDiscovery(nextPostId)
        resolveSave?.(jsonResponse(savedContact, 201))

        await expect(completedContact).resolves.toBeNull()
        expect(store.postId).toBe(nextPostId)
        expect(store.contact).toBeNull()
        expect(store.contacts).toEqual([])
    })

    it('ignores an earlier discovery save after outreach restarts for the same post', async () => {
        let resolveSave: ((response: Response) => void) | undefined
        const saveResponse = new Promise<Response>((resolve) => {
            resolveSave = resolve
        })
        vi.mocked(fetch).mockReturnValueOnce(saveResponse)
        const store = useOutreachStore()

        store.beginDiscovery(post.id)
        const completedContact = store.applyTaskResult({
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            relevanceRationale: 'Her title aligns with the role.',
            draftMessage: 'Initial draft',
        })
        store.beginDiscovery(post.id)
        resolveSave?.(jsonResponse({ error: 'Previous save failed' }, 500))

        await expect(completedContact).resolves.toBeNull()
        expect(store.postId).toBe(post.id)
        expect(store.discovering).toBe(true)
        expect(store.resultError).toBeNull()
    })

    it('ignores an earlier successful save after outreach restarts for the same post', async () => {
        let resolveSave: ((response: Response) => void) | undefined
        const saveResponse = new Promise<Response>((resolve) => {
            resolveSave = resolve
        })
        vi.mocked(fetch).mockReturnValueOnce(saveResponse)
        const store = useOutreachStore()

        store.beginDiscovery(post.id)
        const completedContact = store.applyTaskResult({
            personName: savedContact.personName,
            personTitle: savedContact.personTitle,
            profileUrl: savedContact.profileUrl,
            relevanceRationale: savedContact.relevanceRationale,
            draftMessage: savedContact.draftMessage,
        })
        store.beginDiscovery(post.id)
        resolveSave?.(jsonResponse(savedContact, 201))

        await expect(completedContact).resolves.toBeNull()
        expect(store.discovering).toBe(true)
        expect(store.contacts).toEqual([])
        expect(store.resultError).toBeNull()
    })

    it('ignores an earlier discovery save after draft work begins', async () => {
        let resolveSave: ((response: Response) => void) | undefined
        const saveResponse = new Promise<Response>((resolve) => {
            resolveSave = resolve
        })
        vi.mocked(fetch).mockReturnValueOnce(saveResponse)
        const store = useOutreachStore()

        store.beginDiscovery(post.id)
        const completedContact = store.applyTaskResult({
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            relevanceRationale: 'Her title aligns with the role.',
            draftMessage: 'Initial draft',
        })
        store.beginDraft()
        resolveSave?.(jsonResponse({ error: 'Previous save failed' }, 500))

        await expect(completedContact).resolves.toBeNull()
        expect(store.discovering).toBe(false)
        expect(store.resultError).toBeNull()
    })
})
