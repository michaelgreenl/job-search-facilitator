import type {
    ApplyQueueItem,
    JobPost,
    JobSearchReport,
    OutreachContact,
    WorkTask,
} from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOutreachStore } from '../stores/outreach'
import { usePostStore } from '../stores/post'
import { useReportStore } from '../stores/report'
import {
    getWorkTaskLane,
    useWorkStore,
    type WorkSession,
    type WorkSessionOwner,
    type WorkTaskState,
} from '../stores/work'
import { createJobPostImportTask } from '../work-tasks'

class MemoryStorage implements Storage {
    readonly values = new Map<string, string>()

    get length() {
        return this.values.size
    }

    clear() {
        this.values.clear()
    }

    getItem(key: string) {
        return this.values.get(key) ?? null
    }

    key(index: number) {
        return [...this.values.keys()][index] ?? null
    }

    removeItem(key: string) {
        this.values.delete(key)
    }

    setItem(key: string, value: string) {
        this.values.set(key, value)
    }
}

const post: JobPost = {
    id: '42a2193a-1fcc-4aa0-b8e7-976bd8f107eb',
    sourceKey: 'example:post-1',
    roleTitle: 'Software Engineer',
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: 'https://example.com/jobs/post-1',
    applicationUrl: 'https://apply.example.com/jobs/post-1',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
}

const savedContact: OutreachContact = {
    id: 'e0d9b035-4fe4-476a-8371-c664ee8e224f',
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

const runningTask: WorkTask = {
    id: 'task-1',
    status: 'running',
    threadId: 'thread-1',
    turnId: 'turn-1',
    output: null,
    error: null,
}

const report: JobSearchReport = {
    id: 'cfe834bb-fef0-4276-8e37-7f0ab0fc67d7',
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

    it('loads reports and refreshes one by id without discarding forward-compatible fields', async () => {
        const reportWithAdditions = {
            ...report,
            scoringVersion: 2,
            results: [
                {
                    ...report.results[0]!,
                    modelNote: 'future result field',
                    post: { ...post, sourceMetadata: { importedBy: 'agent' } },
                },
            ],
        }
        const earlierReport = {
            ...report,
            id: 'b98b98ea-70c0-4336-b597-f7eb77d55ad7',
            summary: 'Earlier run',
        }
        const refreshedReport = { ...report, summary: 'Updated summary' }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse([reportWithAdditions, earlierReport]))
            .mockResolvedValueOnce(jsonResponse(refreshedReport))
        const store = useReportStore()

        await store.fetchReports()
        expect(store.reports[0]).toMatchObject({
            scoringVersion: 2,
            results: [
                {
                    modelNote: 'future result field',
                    post: { sourceMetadata: { importedBy: 'agent' } },
                },
            ],
        })
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
        expect(store.reports.map(({ id, summary }) => ({ id, summary }))).toEqual([
            { id: refreshedReport.id, summary: refreshedReport.summary },
            { id: earlierReport.id, summary: earlierReport.summary },
        ])
        expect(store.reports[0]!.results[0]!.post).toMatchObject({
            sourceMetadata: { importedBy: 'agent' },
        })
    })

    it('rejects an unsafe nested post link before changing report state', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse([
                {
                    ...report,
                    results: [
                        {
                            ...report.results[0],
                            post: { ...post, postUrl: 'javascript:alert(1)' },
                        },
                    ],
                },
            ]),
        )
        const store = useReportStore()
        store.reports = [report]

        await expect(store.fetchReports()).rejects.toThrow(
            'API /job-search-reports returned invalid data',
        )

        expect(store.reports).toEqual([report])
        expect(store.loading).toBe(false)
    })

    it('exposes failed requests to the UI', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse({ error: 'Search reports unavailable' }, 500),
        )
        const store = useReportStore()

        await expect(store.fetchReports()).rejects.toThrow('Search reports unavailable')

        expect(store.error).toBe('Search reports unavailable')
        expect(store.loading).toBe(false)
    })
})

describe('post store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('fetch', vi.fn())
        vi.stubGlobal('sessionStorage', new MemoryStorage())
    })

    it('does not carry the add-post popup into a fresh store', () => {
        const store = usePostStore()

        store.openAddPostDialog()
        store.setAddPostUrl('https://example.com/jobs/draft')

        setActivePinia(createPinia())
        const restoredStore = usePostStore()

        expect(restoredStore.addPostDialog).toEqual({
            open: false,
            url: '',
        })
    })

    it('keeps one canonical post across reports, reads, and PATCH responses', async () => {
        const secondPost = {
            ...post,
            id: '3f5dc4a4-7c98-4ef2-8947-cc2d78ab8a7a',
            sourceKey: 'example:post-2',
        }
        const laterReport = {
            ...report,
            id: 'b98b98ea-70c0-4336-b597-f7eb77d55ad7',
            reportDate: '2026-07-14',
            results: [
                {
                    ...report.results[0]!,
                    post: { ...post },
                },
            ],
        }
        const firstReport = {
            ...report,
            results: [
                {
                    ...report.results[0]!,
                    post: { ...post },
                },
            ],
        }
        const updatedPost = {
            ...post,
            applicationStatus: 'awaiting-response' as const,
            userLabel: 'forgo' as const,
            updatedAt: '2026-07-14T12:00:00.000Z',
        }
        const stalePost = {
            ...post,
            roleTitle: 'Stale title',
            updatedAt: updatedPost.updatedAt,
        }
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockResolvedValueOnce(jsonResponse([firstReport, laterReport]))
            .mockResolvedValueOnce(jsonResponse([post, secondPost]))
            .mockResolvedValueOnce(
                jsonResponse({
                    post: updatedPost,
                    inApplyQueue: false,
                }),
            )
            .mockResolvedValueOnce(jsonResponse(stalePost))
        const reportStore = useReportStore()
        const store = usePostStore()

        await reportStore.fetchReports()
        const canonicalPost = store.findPost(post.id)

        expect(canonicalPost).not.toBeNull()
        expect(reportStore.reports[0]!.results[0]!.post).toBe(canonicalPost)
        expect(reportStore.reports[1]!.results[0]!.post).toBe(canonicalPost)

        await store.fetchPosts()
        const unrelatedPost = store.findPost(secondPost.id)
        const updateResult = await store.updatePost(post.id, {
            applicationStatus: 'awaiting-response',
            userLabel: 'forgo',
        })
        const staleReadResult = await store.fetchPost(post.id)

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/job-search-reports',
            undefined,
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/api/job-posts',
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
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            `http://localhost:3000/api/job-posts/${post.id}`,
            undefined,
        )
        expect(updateResult.post).toBe(canonicalPost)
        expect(staleReadResult).toBe(canonicalPost)
        expect(canonicalPost).toEqual(updatedPost)
        expect(unrelatedPost).toEqual(secondPost)
    })

    it('loads the Apply queue from its endpoint', async () => {
        const applyQueuePost = { ...post, userLabel: 'P1' as const }
        const { post: _reportPost, ...recommendation } = report.results[0]!
        const applyQueueItems: ApplyQueueItem[] = [
            {
                post: applyQueuePost,
                recommendationContext: {
                    reportId: report.id,
                    reportDate: report.reportDate,
                    ...recommendation,
                },
            },
        ]
        const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(applyQueueItems))
        const store = usePostStore()

        const items = await store.fetchApplyQueue()

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            'http://localhost:3000/api/job-posts/apply-queue',
            undefined,
        )
        expect(store.posts).toEqual([applyQueuePost])
        expect(items[0]!.recommendationContext).toEqual(applyQueueItems[0]!.recommendationContext)
        expect(items[0]!.post).toBe(store.posts[0])
    })
})

describe('outreach store', () => {
    const seedTask = (
        task: WorkTask,
        owner: WorkSessionOwner,
        state: Partial<WorkTaskState> = {},
    ) => {
        const workStore = useWorkStore()
        const session: WorkSession = { ...owner, taskId: task.id }
        const lane = getWorkTaskLane(owner)
        const taskState: WorkTaskState = {
            taskId: task.id,
            task,
            events: [],
            connectionState: 'idle',
            pendingAction: null,
            alwaysAllowBrowserActions: false,
            actionSubmitting: false,
            cancelling: false,
            starting: false,
            restoring: false,
            sessionUnavailable: false,
            error: null,
            ...state,
        }

        workStore.sessions = [
            ...workStore.sessions.filter((current) => getWorkTaskLane(current) !== lane),
            session,
        ]
        workStore.taskStates = { ...workStore.taskStates, [task.id]: taskState }
        return task
    }

    const updateTask = (task: WorkTask) => {
        const workStore = useWorkStore()
        const state = workStore.getTaskState(task.id)

        if (state === null) {
            throw new Error(`Missing Work task state for ${task.id}`)
        }

        workStore.taskStates = {
            ...workStore.taskStates,
            [task.id]: { ...state, task },
        }
    }

    beforeEach(() => {
        setActivePinia(createPinia())
        vi.stubGlobal('sessionStorage', new MemoryStorage())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('restores completed contact discovery without creating a duplicate contact', async () => {
        const restoredTaskId = 'f67f9fe5-e502-4d28-8c72-c044f1babbb3'
        const completedTask: WorkTask = {
            ...runningTask,
            id: restoredTaskId,
            status: 'completed',
            output: {
                personName: savedContact.personName,
                personTitle: savedContact.personTitle,
                profileUrl: savedContact.profileUrl,
                relevanceRationale: savedContact.relevanceRationale,
                draftMessage: savedContact.draftMessage,
            },
        }
        sessionStorage.setItem(
            'job-search-facilitator:work-session',
            JSON.stringify({
                version: 1,
                session: {
                    kind: 'outreach-contact',
                    taskId: restoredTaskId,
                    postId: post.id,
                },
            }),
        )
        const fetchMock = vi
            .mocked(fetch)
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse(completedTask))
        vi.stubGlobal(
            'EventSource',
            class {
                static readonly CLOSED = 2
                readonly readyState = 0
                close() {}
            },
        )
        const store = useOutreachStore()

        await store.restoreActiveTask()

        await vi.waitFor(() => expect(store.contact).toEqual(savedContact))
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(useWorkStore().getSession('outreach')).toBeNull()
    })

    it('restores the selected contact and edited draft for a cancelled revision', async () => {
        const restoredTaskId = 'f67f9fe5-e502-4d28-8c72-c044f1babbb3'
        const editedDraft = 'Edited draft awaiting revision'
        const cancelledTask: WorkTask = {
            ...runningTask,
            id: restoredTaskId,
            status: 'cancelled',
        }
        sessionStorage.setItem(
            'job-search-facilitator:work-session',
            JSON.stringify({
                version: 1,
                session: {
                    kind: 'outreach-draft',
                    taskId: restoredTaskId,
                    postId: post.id,
                    contactId: savedContact.id,
                    draft: editedDraft,
                    request: 'Make it warmer',
                },
            }),
        )
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse(cancelledTask))
        vi.stubGlobal(
            'EventSource',
            class {
                static readonly CLOSED = 2
                readonly readyState = 0
                close() {}
            },
        )
        const store = useOutreachStore()

        await store.restoreActiveTask()

        expect(store.contact).toEqual(savedContact)
        expect(store.draft).toBe(editedDraft)
        expect(store.drafting).toBe(true)
        expect(store.dismissActiveTask()).toBe(true)
        expect(useWorkStore().getSession('outreach')).toBeNull()
    })

    it('retains a completed draft revision through refresh until it is dismissed', async () => {
        const restoredTaskId = 'f67f9fe5-e502-4d28-8c72-c044f1babbb3'
        const revisedDraft = 'Revised draft from Work'
        const completedTask: WorkTask = {
            ...runningTask,
            id: restoredTaskId,
            status: 'completed',
            output: {
                draftMessage: revisedDraft,
                response: 'Made the introduction warmer.',
            },
        }
        sessionStorage.setItem(
            'job-search-facilitator:work-session',
            JSON.stringify({
                version: 1,
                session: {
                    kind: 'outreach-draft',
                    taskId: restoredTaskId,
                    postId: post.id,
                    contactId: savedContact.id,
                    draft: savedContact.draftMessage,
                    request: 'Make it warmer',
                },
            }),
        )
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse([savedContact]))
            .mockResolvedValueOnce(jsonResponse(completedTask))
        vi.stubGlobal(
            'EventSource',
            class {
                static readonly CLOSED = 2
                readonly readyState = 0
                close() {}
            },
        )
        const store = useOutreachStore()

        await store.restoreActiveTask()

        await vi.waitFor(() => expect(store.draft).toBe(revisedDraft))
        expect(store.assistantReply).toBe('Made the introduction warmer.')
        expect(store.hasActiveTask).toBe(true)
        expect(useWorkStore().getSession('outreach')?.taskId).toBe(restoredTaskId)

        expect(store.dismissActiveTask()).toBe(true)
        expect(useWorkStore().getSession('outreach')).toBeNull()
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

    it('rejects unsafe contact links before changing outreach state', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse([{ ...savedContact, profileUrl: 'javascript:alert(1)' }]),
        )
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]

        await expect(store.fetchContacts(post.id)).rejects.toThrow(
            `API /job-posts/${post.id}/outreach-contacts returned invalid data`,
        )

        expect(store.contacts).toEqual([savedContact])
        expect(store.contactsLoading).toBe(false)
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
        const fetchMock = vi.mocked(fetch).mockReturnValueOnce(updateResponse)
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]
        store.selectContact(savedContact)

        const update = store.updateContactMessaged(savedContact.id, true)

        expect(store.contactUpdating).toBe(true)
        expect(fetchMock).toHaveBeenCalledOnce()
        store.openForPost('post-2')
        resolveUpdate?.(jsonResponse({ ...savedContact, messaged: true }))

        await expect(update).resolves.toBeNull()
        expect(store.postId).toBe('post-2')
        expect(store.contact).toBeNull()
        expect(store.contacts).toEqual([])
        expect(store.contactUpdating).toBe(false)
        expect(store.contactUpdateError).toBeNull()
    })

    it('starts contact discovery while a job-post import task is active', async () => {
        const importTask: WorkTask = {
            ...runningTask,
            id: '81e09f1d-8af3-45a6-9ddc-8a12586297f1',
            threadId: 'import-thread-1',
            turnId: 'import-turn-1',
        }
        const outreachTask: WorkTask = {
            ...runningTask,
            id: '0c2035b4-0d2d-422b-a331-0c3ad0adca6e',
            threadId: 'outreach-thread-1',
            turnId: 'outreach-turn-1',
        }
        const importUrl = 'https://example.com/jobs/imported-role'
        vi.stubGlobal('crypto', {
            randomUUID: vi
                .fn()
                .mockReturnValueOnce(importTask.id)
                .mockReturnValueOnce(outreachTask.id),
        })
        vi.stubGlobal(
            'EventSource',
            class {
                static readonly CLOSED = 2
                readonly readyState = 0
                close() {}
            },
        )
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(importTask, 202))
            .mockResolvedValueOnce(jsonResponse({ status: 'healthy', capabilities: ['chrome'] }))
            .mockResolvedValueOnce(jsonResponse(outreachTask, 202))
        const workStore = useWorkStore()

        await workStore.startTask(createJobPostImportTask(importUrl), {
            kind: 'job-post-import',
            url: importUrl,
        })

        const store = useOutreachStore()

        await expect(store.startContactDiscovery(post)).resolves.toBe(true)

        expect(workStore.getSession('job-post-import')).toEqual({
            kind: 'job-post-import',
            taskId: importTask.id,
            url: importUrl,
        })
        expect(workStore.getTaskState(importTask.id)?.task).toEqual(importTask)
        expect(workStore.getSession('outreach')).toEqual({
            kind: 'outreach-contact',
            taskId: outreachTask.id,
            postId: post.id,
        })
        expect(workStore.getTaskState(outreachTask.id)?.task).toEqual(outreachTask)
    })

    it('persists and selects a discovered contact when Work completes without a mounted panel', async () => {
        const output = {
            personName: ` ${savedContact.personName} `,
            personTitle: savedContact.personTitle,
            profileUrl: ` ${savedContact.profileUrl} `,
            relevanceRationale: savedContact.relevanceRationale,
            draftMessage: savedContact.draftMessage,
        }
        const contactInput = {
            personName: savedContact.personName,
            personTitle: savedContact.personTitle,
            profileUrl: savedContact.profileUrl,
            relevanceRationale: savedContact.relevanceRationale,
            draftMessage: savedContact.draftMessage,
        }
        const completedTask: WorkTask = {
            ...runningTask,
            status: 'completed',
            output,
        }
        const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(savedContact, 201))
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(completedTask, owner)
        })
        const store = useOutreachStore()

        await expect(store.startContactDiscovery(post)).resolves.toBe(true)

        await vi.waitFor(() => {
            expect(store.contact).toEqual(savedContact)
        })
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            `http://localhost:3000/api/job-posts/${post.id}/outreach-contacts`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contactInput),
            },
        )
        expect(store.contacts).toEqual([savedContact])
        expect(store.draft).toBe(savedContact.draftMessage)
    })

    it('does not select a contact when completed discovery persistence fails', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 500))
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const store = useOutreachStore()
        await store.startContactDiscovery(post)

        updateTask({
            ...runningTask,
            status: 'completed',
            output: {
                personName: savedContact.personName,
                personTitle: savedContact.personTitle,
                profileUrl: savedContact.profileUrl,
                relevanceRationale: savedContact.relevanceRationale,
                draftMessage: savedContact.draftMessage,
            },
        })

        await vi.waitFor(() => {
            expect(store.resultError).toBe('API request failed (500)')
        })
        expect(store.contactSaving).toBe(false)
        expect(store.contact).toBeNull()
        expect(store.contacts).toEqual([])
    })

    it('updates the draft and assistant reply when draft Work completes', async () => {
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]
        store.selectContact(savedContact)

        await expect(store.requestDraftRevision(post, 'Make it warmer')).resolves.toBe(true)
        updateTask({
            ...runningTask,
            status: 'completed',
            output: {
                draftMessage: 'A warmer draft',
                response: 'I made the introduction warmer.',
            },
        })

        await vi.waitFor(() => {
            expect(store.draft).toBe('A warmer draft')
        })
        expect(store.assistantReply).toBe('I made the introduction warmer.')
    })

    it('does not apply a draft result after another contact is selected', async () => {
        const otherContact: OutreachContact = {
            ...savedContact,
            id: 'contact-2',
            personName: 'Grace Hopper',
            profileUrl: 'https://www.linkedin.com/in/grace-hopper',
            draftMessage: 'Draft for Grace',
        }
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact, otherContact]
        store.selectContact(savedContact)
        await expect(store.requestDraftRevision(post, 'Make it warmer')).resolves.toBe(true)
        expect(store.drafting).toBe(true)

        store.selectContact(otherContact)
        updateTask({
            ...runningTask,
            status: 'completed',
            output: {
                draftMessage: 'Revised draft for Ada',
                response: 'I revised the message.',
            },
        })

        await vi.waitFor(() => {
            expect(store.drafting).toBe(false)
        })
        expect(store.contact).toEqual(otherContact)
        expect(store.draft).toBe(otherContact.draftMessage)
        expect(store.assistantReply).toBeNull()
    })

    it('retains cancelled outreach until it is dismissed', async () => {
        const cancelledTask: WorkTask = { ...runningTask, status: 'cancelled' }
        let resolveCancellation: ((task: WorkTask) => void) | undefined
        const cancellationResponse = new Promise<WorkTask>((resolve) => {
            resolveCancellation = resolve
        })
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const cancelTask = vi
            .spyOn(workStore, 'cancelTask')
            .mockReturnValueOnce(cancellationResponse)
        const store = useOutreachStore()
        await store.startContactDiscovery(post)

        const cancellation = store.cancelActiveTask()

        expect(store.discovering).toBe(true)
        updateTask(cancelledTask)
        resolveCancellation?.(cancelledTask)
        await expect(cancellation).resolves.toBe(true)
        expect(cancelTask).toHaveBeenCalledExactlyOnceWith(runningTask.id)
        expect(store.discovering).toBe(true)
        expect(workStore.getSession('outreach')?.taskId).toBe(runningTask.id)
        expect(store.dismissActiveTask()).toBe(true)
        expect(store.discovering).toBe(false)
    })

    it('preserves active outreach when Work cancellation fails', async () => {
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const cancelTask = vi
            .spyOn(workStore, 'cancelTask')
            .mockRejectedValueOnce(new Error('Could not cancel task'))
        const store = useOutreachStore()
        await store.startContactDiscovery(post)

        await expect(store.cancelActiveTask()).rejects.toThrow('Could not cancel task')

        expect(cancelTask).toHaveBeenCalledExactlyOnceWith(runningTask.id)
        expect(store.discovering).toBe(true)
    })

    it('retains failed outreach until it is dismissed', async () => {
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const store = useOutreachStore()
        await expect(store.startContactDiscovery(post)).resolves.toBe(true)
        expect(store.discovering).toBe(true)

        updateTask({ ...runningTask, status: 'failed', error: 'Chrome stopped responding' })

        await vi.waitFor(() => {
            expect(store.resultError).toBe('Chrome stopped responding')
        })
        expect(fetch).not.toHaveBeenCalled()
        expect(store.discovering).toBe(true)
        expect(store.dismissActiveTask()).toBe(true)
        expect(store.discovering).toBe(false)
    })

    it('cancels a task that starts after its outreach context is reset', async () => {
        const cancelledTask: WorkTask = { ...runningTask, status: 'cancelled' }
        let resolveStart: ((task: WorkTask) => void) | undefined
        const startResponse = new Promise<WorkTask>((resolve) => {
            resolveStart = resolve
        })
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            const task = await startResponse
            return seedTask(task, owner)
        })
        const cancelTask = vi.spyOn(workStore, 'cancelTask').mockResolvedValueOnce(cancelledTask)
        const store = useOutreachStore()

        const start = store.startContactDiscovery(post)
        store.reset()
        resolveStart?.(runningTask)

        await expect(start).resolves.toBe(false)
        expect(cancelTask).toHaveBeenCalledExactlyOnceWith(runningTask.id)
        expect(store.postId).toBeNull()
        expect(store.discovering).toBe(false)
    })

    it('does not persist or select an invalid completed discovery', async () => {
        const output = {
            personName: savedContact.personName,
        }
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const store = useOutreachStore()
        await store.startContactDiscovery(post)

        updateTask({ ...runningTask, status: 'completed', output })

        await vi.waitFor(() => {
            expect(store.resultError).toBe('Work returned an invalid outreach result')
        })
        expect(fetch).not.toHaveBeenCalled()
        expect(store.contact).toBeNull()
        expect(store.contacts).toEqual([])
    })

    it('ignores a pending discovery save after outreach cancellation', async () => {
        let resolveSave: ((response: Response) => void) | undefined
        const saveResponse = new Promise<Response>((resolve) => {
            resolveSave = resolve
        })
        vi.mocked(fetch).mockReturnValueOnce(saveResponse)
        const cancelledTask: WorkTask = { ...runningTask, status: 'cancelled' }
        let resolveCancellation: ((task: WorkTask) => void) | undefined
        const cancellationResponse = new Promise<WorkTask>((resolve) => {
            resolveCancellation = resolve
        })
        const workStore = useWorkStore()
        vi.spyOn(workStore, 'startTask').mockImplementation(async (_input, owner) => {
            return seedTask(runningTask, owner)
        })
        const cancelTask = vi
            .spyOn(workStore, 'cancelTask')
            .mockReturnValueOnce(cancellationResponse)
        const store = useOutreachStore()
        await store.startContactDiscovery(post)
        const cancellation = store.cancelActiveTask()

        updateTask({
            ...runningTask,
            status: 'completed',
            output: {
                personName: savedContact.personName,
                personTitle: savedContact.personTitle,
                profileUrl: savedContact.profileUrl,
                relevanceRationale: savedContact.relevanceRationale,
                draftMessage: savedContact.draftMessage,
            },
        })
        await vi.waitFor(() => {
            expect(store.contactSaving).toBe(true)
        })
        updateTask(cancelledTask)
        workStore.dismissSession(cancelledTask.id)
        resolveCancellation?.(cancelledTask)
        await expect(cancellation).resolves.toBe(true)
        expect(cancelTask).toHaveBeenCalledExactlyOnceWith(runningTask.id)
        resolveSave?.(jsonResponse(savedContact, 201))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(store.contact).toBeNull()
        expect(store.contacts).toEqual([])
        expect(store.discovering).toBe(false)
        expect(store.resultError).toBeNull()
    })
})
