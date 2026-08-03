import type {
    ApplyQueueItem,
    JobPost,
    JobSearchReport,
    OutreachContact,
    AgentTask,
} from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOutreachStore } from '../stores/outreach'
import { usePostStore } from '../stores/post'
import { useReportStore } from '../stores/report'
import {
    useAgentStore,
    type AgentSession,
    type AgentSessionOwner,
    type AgentTaskState,
} from '../stores/agent'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestUrl } from '@/test/support/http'
import { MemoryStorage } from '@/test/support/memory-storage'

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
    appliedAt: null,
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
    messagedAt: null,
    respondedAt: null,
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
}

const runningTask: AgentTask = {
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
    const secondPost: JobPost = {
        ...post,
        id: '42a2193a-1fcc-4aa0-b8e7-976bd8f107ec',
        sourceKey: 'example:post-2',
    }
    const secondContact: OutreachContact = {
        ...savedContact,
        id: 'e0d9b035-4fe4-476a-8371-c664ee8e2250',
        jobPostId: post.id,
        personName: 'Grace Hopper',
        profileUrl: 'https://www.linkedin.com/in/grace-hopper',
        draftMessage: 'Second draft',
    }

    const seedTask = (
        task: AgentTask,
        owner: AgentSessionOwner,
        state: Partial<AgentTaskState> = {},
    ) => {
        const agentStore = useAgentStore()
        const taskState: AgentTaskState = {
            taskId: task.id,
            task,
            events: [],
            connectionState: 'idle',
            pendingPermission: null,
            alwaysAllowBrowserActions: false,
            permissionSubmitting: false,
            cancelling: false,
            starting: false,
            restoring: false,
            sessionUnavailable: false,
            error: null,
            ...state,
        }

        agentStore.taskStates = { ...agentStore.taskStates, [task.id]: taskState }
        agentStore.sessions = [
            ...agentStore.sessions.filter((session) => session.taskId !== task.id),
            { ...owner, taskId: task.id } as AgentSession,
        ]
        return task
    }

    const taskStart = (task: AgentTask, owner: AgentSessionOwner) => ({
        taskId: task.id,
        started: Promise.resolve(seedTask(task, owner)),
    })

    const stubTaskStarts = (tasks: AgentTask[]) => {
        const pendingTasks = [...tasks]

        return vi.spyOn(useAgentStore(), 'startTask').mockImplementation((_input, owner) => {
            const task = pendingTasks.shift()

            if (task === undefined) {
                throw new Error('Unexpected Agent task start')
            }

            return taskStart(task, owner)
        })
    }

    const updateTask = (task: AgentTask) => {
        const agentStore = useAgentStore()
        const state = agentStore.getTaskState(task.id)

        if (state === null) {
            throw new Error('Missing Agent task state for ' + task.id)
        }

        agentStore.taskStates = {
            ...agentStore.taskStates,
            [task.id]: { ...state, task },
        }
    }

    const completedDiscovery = (task: AgentTask, contact: OutreachContact): AgentTask => ({
        ...task,
        status: 'completed',
        output: {
            personName: contact.personName,
            personTitle: contact.personTitle,
            profileUrl: contact.profileUrl,
            relevanceRationale: contact.relevanceRationale,
            draftMessage: contact.draftMessage,
        },
        error: null,
    })

    const persistedTaskIds = () => {
        const stored = sessionStorage.getItem('job-search-facilitator:agent-session')

        if (stored === null) {
            return []
        }

        return (JSON.parse(stored) as { sessions: AgentSession[] }).sessions.map(
            ({ taskId }) => taskId,
        )
    }

    beforeEach(() => {
        setActivePinia(createPinia())
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        vi.stubGlobal('sessionStorage', new MemoryStorage())
        vi.stubGlobal('fetch', vi.fn())
    })

    it('restores a completed discovery without saving an existing contact twice', async () => {
        const taskId = 'f67f9fe5-e502-4d28-8c72-c044f1babbb3'
        const completedTask = completedDiscovery({ ...runningTask, id: taskId }, savedContact)
        sessionStorage.setItem(
            'job-search-facilitator:agent-session',
            JSON.stringify({
                version: 2,
                sessions: [{ kind: 'outreach-contact', taskId, postId: post.id }],
            }),
        )
        vi.mocked(fetch).mockImplementation(async (input, init) => {
            const url = requestUrl(input)

            if (url.endsWith('/tasks/' + taskId)) {
                return jsonResponse(completedTask)
            }

            if (
                url.endsWith('/job-posts/' + post.id + '/outreach-contacts') &&
                init?.method !== 'POST'
            ) {
                return jsonResponse([savedContact])
            }

            throw new Error('Unexpected request: ' + url)
        })
        const agentStore = useAgentStore()
        await agentStore.restoreSessions()
        const store = useOutreachStore()

        await store.restoreTaskContext()

        await vi.waitFor(() => expect(store.contact).toEqual(savedContact))
        expect(agentStore.getSession(taskId)).toBeNull()
        expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    })

    it('updates the selected contact from the saved PATCH response', async () => {
        const updatedContact = {
            ...savedContact,
            messaged: true,
            updatedAt: '2026-07-22T12:00:00.000Z',
        }
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updatedContact))
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]
        store.selectContact(savedContact)
        store.draft = 'Locally edited draft'

        await expect(store.updateContactMessaged(savedContact.id, true)).resolves.toEqual(
            updatedContact,
        )

        expect(store.contact).toEqual(updatedContact)
        expect(store.contacts).toEqual([updatedContact])
        expect(store.draft).toBe('Locally edited draft')
    })

    it('does not replace saved contacts with an invalid API response', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            jsonResponse([{ ...savedContact, profileUrl: 'javascript:alert(1)' }]),
        )
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact]

        await expect(store.fetchContacts(post.id)).rejects.toThrow(
            'API /job-posts/' + post.id + '/outreach-contacts returned invalid data',
        )

        expect(store.contacts).toEqual([savedContact])
        expect(store.contactsLoading).toBe(false)
    })

    it('indexes every same-post and cross-post run by its exact task ID', async () => {
        const samePostTask: AgentTask = {
            ...runningTask,
            id: 'task-2',
            threadId: 'thread-2',
            turnId: 'turn-2',
        }
        const otherPostTask: AgentTask = {
            ...runningTask,
            id: 'task-3',
            threadId: 'thread-3',
            turnId: 'turn-3',
        }
        stubTaskStarts([runningTask, samePostTask, otherPostTask])
        const agentStore = useAgentStore()
        const store = useOutreachStore()

        store.openForPost(post.id)
        await store.startContactDiscovery(post)
        await store.startContactDiscovery(post)
        store.openForPost(secondPost.id)
        await store.startContactDiscovery(secondPost)

        expect(agentStore.sessions.map(({ taskId }) => taskId)).toEqual([
            runningTask.id,
            samePostTask.id,
            otherPostTask.id,
        ])
        store.openForPost(post.id)
        expect(store.tasks.map(({ taskId }) => taskId)).toEqual([runningTask.id, samePostTask.id])
        expect(store.openTask(runningTask.id)).toBe(true)
        expect(store.taskId).toBe(runningTask.id)
        expect(store.openTask(otherPostTask.id)).toBe(true)
        expect(store.postId).toBe(secondPost.id)
        expect(store.taskId).toBe(otherPostTask.id)
    })

    it('persists same-post results independently without a background result replacing the foreground', async () => {
        const samePostTask: AgentTask = {
            ...runningTask,
            id: 'task-2',
            threadId: 'thread-2',
            turnId: 'turn-2',
        }
        const persistedContacts: OutreachContact[] = []
        vi.mocked(fetch).mockImplementation(async (input, init) => {
            const url = requestUrl(input)

            if (!url.endsWith('/job-posts/' + post.id + '/outreach-contacts')) {
                throw new Error('Unexpected request: ' + url)
            }

            if (init?.method !== 'POST') {
                return jsonResponse(persistedContacts)
            }

            if (typeof init.body !== 'string') {
                throw new Error('Expected a JSON request body')
            }

            const inputContact = JSON.parse(init.body) as { profileUrl: string }
            const saved =
                inputContact.profileUrl === savedContact.profileUrl ? savedContact : secondContact
            persistedContacts.push(saved)
            return jsonResponse(saved, 201)
        })
        stubTaskStarts([runningTask, samePostTask])
        const agentStore = useAgentStore()
        const store = useOutreachStore()
        store.openForPost(post.id)
        await store.startContactDiscovery(post)
        await store.startContactDiscovery(post)

        updateTask(completedDiscovery(samePostTask, secondContact))
        updateTask(completedDiscovery(runningTask, savedContact))
        await vi.waitFor(() => {
            expect(agentStore.getSession(samePostTask.id)).toBeNull()
            expect(agentStore.getSession(runningTask.id)).toBeNull()
        })

        expect(persistedContacts.map(({ id }) => id).sort()).toEqual(
            [savedContact.id, secondContact.id].sort(),
        )
        expect(store.contact).toEqual(secondContact)
        expect(store.contacts.map(({ id }) => id).sort()).toEqual(
            [savedContact.id, secondContact.id].sort(),
        )
    })

    it('cancels and retries one same-post run without changing its active sibling', async () => {
        const firstTask: AgentTask = {
            ...runningTask,
            id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
        }
        const siblingTask: AgentTask = {
            ...runningTask,
            id: 'a8314bdd-2a1c-48f3-8982-a57fd8b04f5c',
            threadId: 'thread-2',
            turnId: 'turn-2',
        }
        const retryTask: AgentTask = {
            ...runningTask,
            id: '90766a9a-1096-40a7-89bb-a0e4c3eacfed',
            threadId: 'thread-3',
            turnId: 'turn-3',
        }
        const tasksById = new Map(
            [firstTask, siblingTask, retryTask].map((task) => [task.id, task]),
        )
        vi.stubGlobal('crypto', {
            randomUUID: vi
                .fn()
                .mockReturnValueOnce(firstTask.id)
                .mockReturnValueOnce(siblingTask.id)
                .mockReturnValueOnce(retryTask.id),
        })
        vi.mocked(fetch).mockImplementation(async (input, init) => {
            const url = requestUrl(input)

            if (url.endsWith('/health')) {
                return jsonResponse({ status: 'healthy', capabilities: ['chrome'] })
            }

            if (url.endsWith('/tasks/' + firstTask.id + '/cancel')) {
                return jsonResponse({ ...firstTask, status: 'cancelled' }, 202)
            }

            const taskId = [...tasksById.keys()].find((id) => url.endsWith('/tasks/' + id))

            if (taskId !== undefined && init?.method === 'PUT') {
                return jsonResponse(tasksById.get(taskId), 202)
            }

            throw new Error('Unexpected request: ' + url)
        })
        const agentStore = useAgentStore()
        const store = useOutreachStore()
        store.openForPost(post.id)
        await store.startContactDiscovery(post)
        await store.startContactDiscovery(post)

        store.openTask(firstTask.id)
        await store.cancelActiveTask()

        expect(agentStore.getTaskState(firstTask.id)?.task?.status).toBe('cancelled')
        expect(agentStore.isTaskActive(siblingTask.id)).toBe(true)
        expect(persistedTaskIds()).toEqual([siblingTask.id])

        await store.retryTask(post)

        expect(agentStore.getSession(firstTask.id)).toBeNull()
        expect(agentStore.isTaskActive(siblingTask.id)).toBe(true)
        expect(agentStore.isTaskActive(retryTask.id)).toBe(true)
        expect(store.taskId).toBe(retryTask.id)
        expect(persistedTaskIds()).toEqual([siblingTask.id, retryTask.id])
    })

    it('keeps a completed discovery retryable when saving its contact fails', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        stubTaskStarts([runningTask])
        const agentStore = useAgentStore()
        const store = useOutreachStore()
        store.openForPost(post.id)
        await store.startContactDiscovery(post)

        updateTask(completedDiscovery(runningTask, savedContact))

        await vi.waitFor(() => expect(store.taskRetryAvailable).toBe(true))
        expect(store.tasks[0]?.status).toBe('unavailable')
        expect(store.contact).toBeNull()
        expect(agentStore.getSession(runningTask.id)).not.toBeNull()
    })

    it('applies a completed draft only to the contact and run that are reopened', async () => {
        const otherContact: OutreachContact = {
            ...secondContact,
            jobPostId: post.id,
        }
        vi.mocked(fetch).mockResolvedValue(jsonResponse([savedContact, otherContact]))
        stubTaskStarts([runningTask])
        const agentStore = useAgentStore()
        const store = useOutreachStore()
        store.openForPost(post.id)
        store.contacts = [savedContact, otherContact]
        store.selectContact(savedContact)
        await store.requestDraftRevision(post, 'Make it warmer')

        store.selectContact(otherContact)
        updateTask({
            ...runningTask,
            status: 'completed',
            output: {
                draftMessage: 'A warmer draft',
                response: 'Revised',
            },
        })
        await vi.waitFor(() => expect(store.contact).toEqual(otherContact))
        expect(store.draft).toBe(otherContact.draftMessage)
        expect(agentStore.getSession(runningTask.id)).not.toBeNull()

        store.openTask(runningTask.id)

        await vi.waitFor(() => expect(agentStore.getSession(runningTask.id)).toBeNull())
        expect(store.contact).toEqual(savedContact)
        expect(store.draft).toBe('A warmer draft')
    })

    it('keeps an active run alive when its panel context is reset', async () => {
        stubTaskStarts([runningTask])
        const agentStore = useAgentStore()
        const store = useOutreachStore()
        store.openForPost(post.id)
        await store.startContactDiscovery(post)

        store.reset()

        expect(store.postId).toBeNull()
        expect(agentStore.isTaskActive(runningTask.id)).toBe(true)
        expect(agentStore.getSession(runningTask.id)).not.toBeNull()
    })
})
