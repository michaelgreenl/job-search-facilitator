import {
    parseContactDiscoveryResult,
    parseDraftRevisionResult,
    parseOutreachContact,
    parseOutreachContacts,
    type ContactDiscoveryResult,
    type DraftRevisionResult,
    type JobPost,
    type JsonObject,
    type OutreachContact,
    type StartWorkTaskInput,
    type UpdateOutreachContactInput,
    type WorkTask,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { request } from '@/api'
import { useWorkTask } from '@/composables/useWorkTask'
import { createContactDiscoveryTask, createDraftRevisionTask } from '@/work-tasks'
import type { WorkSession, WorkSessionOwner } from './work'

type OutreachTaskKind = 'contact' | 'draft'
type OutreachTaskPhase = 'starting' | 'running' | 'applying' | 'settled'

interface ActiveOutreachTask {
    revision: number
    kind: OutreachTaskKind
    postId: string
    contactId: string | null
    taskId: string | null
    phase: OutreachTaskPhase
}

type OutreachWorkSession = Exclude<WorkSession, { kind: 'job-post-import' }>

export const useOutreachStore = defineStore('outreach', () => {
    const workTask = useWorkTask('outreach')
    const initialSession =
        workTask.session.value?.kind === 'outreach-contact' ||
        workTask.session.value?.kind === 'outreach-draft'
            ? workTask.session.value
            : null
    const postId = shallowRef<string | null>(initialSession?.postId ?? null)
    const contacts = shallowRef<OutreachContact[]>([])
    const contact = shallowRef<OutreachContact | null>(null)
    const draft = shallowRef(initialSession?.kind === 'outreach-draft' ? initialSession.draft : '')
    const assistantReply = shallowRef<string | null>(null)
    const activeTask = shallowRef<ActiveOutreachTask | null>(
        initialSession === null
            ? null
            : {
                  revision: 0,
                  kind: initialSession.kind === 'outreach-contact' ? 'contact' : 'draft',
                  postId: initialSession.postId,
                  contactId:
                      initialSession.kind === 'outreach-draft' ? initialSession.contactId : null,
                  taskId: initialSession.taskId,
                  phase: 'starting',
              },
    )
    const contactSaving = shallowRef(false)
    const contactUpdating = shallowRef(false)
    const contactUpdateError = shallowRef<string | null>(null)
    const resultError = shallowRef<string | null>(null)
    const contactsLoading = shallowRef(false)
    const contactsError = shallowRef<string | null>(null)
    const discovering = computed(() => activeTask.value?.kind === 'contact')
    const drafting = computed(() => activeTask.value?.kind === 'draft')
    const hasActiveTask = computed(() => activeTask.value !== null)
    let resultRevision = 0
    let contactRequestRevision = 0
    let contactUpdateRevision = 0
    let restorePromise: Promise<boolean> | null = null

    function openForPost(post: string) {
        resultRevision += 1
        contactRequestRevision += 1
        contactUpdateRevision += 1
        contactsLoading.value = false
        contactsError.value = null
        contactUpdating.value = false
        contactUpdateError.value = null

        if (postId.value !== post) {
            contacts.value = []
        }

        postId.value = post
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        activeTask.value = null
        contactSaving.value = false
        resultError.value = null
    }

    function taskContextMatches(task: ActiveOutreachTask) {
        return (
            postId.value === task.postId &&
            (task.kind === 'contact' || contact.value?.id === task.contactId)
        )
    }

    async function startTask(
        task: ActiveOutreachTask,
        input: StartWorkTaskInput,
        owner: WorkSessionOwner,
    ) {
        activeTask.value = task

        try {
            const startedTask = await workTask.startTask(input, owner)
            const currentTask = activeTask.value

            if (
                currentTask?.revision !== task.revision ||
                currentTask.phase !== 'starting' ||
                !taskContextMatches(currentTask)
            ) {
                if (
                    workTask.task.value?.id === startedTask.id &&
                    workTask.task.value.status === 'running'
                ) {
                    await workTask.cancelTask().catch(() => undefined)
                }

                return false
            }

            activeTask.value = {
                ...currentTask,
                taskId: startedTask.id,
                phase: 'running',
            }
            applyWorkTask(workTask.task.value)
            return true
        } catch (error) {
            if (activeTask.value?.revision === task.revision) {
                const currentSession = currentOutreachSession()

                if (
                    currentSession !== null &&
                    currentSession.postId === task.postId &&
                    (task.kind === 'contact'
                        ? currentSession.kind === 'outreach-contact'
                        : currentSession.kind === 'outreach-draft' &&
                          currentSession.contactId === task.contactId)
                ) {
                    activeTask.value = {
                        ...activeTask.value,
                        taskId: currentSession.taskId,
                        phase: 'running',
                    }
                }

                failResult(
                    task.revision,
                    error instanceof Error ? error.message : 'Could not start outreach task',
                )
            }

            throw error
        }
    }

    async function startContactDiscovery(post: JobPost) {
        if (
            workTask.taskActive.value ||
            workTask.session.value !== null ||
            contactSaving.value ||
            contactUpdating.value ||
            contactsLoading.value
        ) {
            return false
        }

        openForPost(post.id)
        return startTask(
            {
                revision: resultRevision,
                kind: 'contact',
                postId: post.id,
                contactId: null,
                taskId: null,
                phase: 'starting',
            },
            createContactDiscoveryTask(post),
            { kind: 'outreach-contact', postId: post.id },
        )
    }

    async function fetchContacts(post: string) {
        const requestRevision = ++contactRequestRevision
        contactsLoading.value = true
        contactsError.value = null

        try {
            const savedContacts = await request(
                `/job-posts/${encodeURIComponent(post)}/outreach-contacts`,
                parseOutreachContacts,
            )

            if (postId.value !== post || contactRequestRevision !== requestRevision) {
                return null
            }

            contacts.value = savedContacts
            return savedContacts
        } catch (error) {
            if (postId.value !== post || contactRequestRevision !== requestRevision) {
                return null
            }

            contactsError.value =
                error instanceof Error ? error.message : 'Could not load outreach contacts'
            throw error
        } finally {
            if (postId.value === post && contactRequestRevision === requestRevision) {
                contactsLoading.value = false
            }
        }
    }

    function selectContact(selectedContact: OutreachContact) {
        contact.value = selectedContact
        draft.value = selectedContact.draftMessage
        assistantReply.value = null
        resultError.value = null
        contactUpdateError.value = null
    }

    function clearContact() {
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        contactUpdateError.value = null
    }

    async function updateContactMessaged(contactId: string, messaged: boolean) {
        const activePostId = postId.value

        if (activePostId === null || contactUpdating.value) {
            return null
        }

        const updateRevision = ++contactUpdateRevision
        const input: UpdateOutreachContactInput = { messaged }
        contactUpdating.value = true
        contactUpdateError.value = null

        try {
            const updatedContact = await request(
                `/job-posts/${encodeURIComponent(activePostId)}/outreach-contacts/${encodeURIComponent(contactId)}`,
                parseOutreachContact,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                },
            )

            if (postId.value !== activePostId || contactUpdateRevision !== updateRevision) {
                return null
            }

            contacts.value = contacts.value.map((savedContact) =>
                savedContact.id === updatedContact.id ? updatedContact : savedContact,
            )

            if (contact.value?.id === updatedContact.id) {
                contact.value = updatedContact
            }

            return updatedContact
        } catch (error) {
            if (
                postId.value === activePostId &&
                contactUpdateRevision === updateRevision &&
                contact.value?.id === contactId
            ) {
                contactUpdateError.value =
                    error instanceof Error ? error.message : 'Could not update contact status'
            }

            throw error
        } finally {
            if (postId.value === activePostId && contactUpdateRevision === updateRevision) {
                contactUpdating.value = false
            }
        }
    }

    async function requestDraftRevision(post: JobPost, userRequest: string) {
        const selectedContact = contact.value
        const currentDraft = draft.value
        const request = userRequest.trim()

        if (
            postId.value !== post.id ||
            selectedContact === null ||
            !currentDraft.trim() ||
            !request ||
            workTask.taskActive.value ||
            workTask.session.value !== null
        ) {
            return false
        }

        resultRevision += 1
        assistantReply.value = null
        contactSaving.value = false
        resultError.value = null

        return startTask(
            {
                revision: resultRevision,
                kind: 'draft',
                postId: post.id,
                contactId: selectedContact.id,
                taskId: null,
                phase: 'starting',
            },
            createDraftRevisionTask(post, selectedContact, currentDraft, request),
            {
                kind: 'outreach-draft',
                postId: post.id,
                contactId: selectedContact.id,
                draft: currentDraft,
                request,
            },
        )
    }

    function currentOutreachSession(): OutreachWorkSession | null {
        const currentSession = workTask.session.value

        return currentSession?.kind === 'outreach-contact' ||
            currentSession?.kind === 'outreach-draft'
            ? currentSession
            : null
    }

    function sessionMatches(task: ActiveOutreachTask) {
        return currentOutreachSession()?.taskId === task.taskId
    }

    async function restoreActiveTask() {
        if (restorePromise !== null) {
            return restorePromise
        }

        const restore = async () => {
            const session = currentOutreachSession()

            if (session === null) {
                return false
            }

            const revision = ++resultRevision
            contactRequestRevision += 1
            contactUpdateRevision += 1
            postId.value = session.postId
            contacts.value = []
            contact.value = null
            draft.value = session.kind === 'outreach-draft' ? session.draft : ''
            assistantReply.value = null
            contactSaving.value = false
            contactUpdating.value = false
            contactUpdateError.value = null
            resultError.value = null
            activeTask.value = {
                revision,
                kind: session.kind === 'outreach-contact' ? 'contact' : 'draft',
                postId: session.postId,
                contactId: session.kind === 'outreach-draft' ? session.contactId : null,
                taskId: session.taskId,
                phase: 'starting',
            }

            let contextReady = false

            try {
                const savedContacts = await fetchContacts(session.postId)

                if (
                    savedContacts === null ||
                    currentOutreachSession()?.taskId !== session.taskId ||
                    activeTask.value?.revision !== revision
                ) {
                    return false
                }

                if (session.kind === 'outreach-draft') {
                    const selectedContact = savedContacts.find(({ id }) => id === session.contactId)

                    if (selectedContact === undefined) {
                        resultError.value = 'The saved outreach contact is no longer available'
                    } else {
                        selectContact(selectedContact)
                        draft.value = session.draft
                        contextReady = true
                    }
                } else {
                    contextReady = true
                }
            } catch (error) {
                if (currentOutreachSession()?.taskId === session.taskId) {
                    resultError.value =
                        error instanceof Error
                            ? error.message
                            : 'Could not restore outreach contacts'
                }
            }

            try {
                await workTask.restoreSession()
            } catch (error) {
                if (currentOutreachSession()?.taskId === session.taskId) {
                    resultError.value =
                        error instanceof Error ? error.message : 'Could not restore outreach task'
                }
            }

            const currentTask = activeTask.value

            if (
                currentTask?.revision !== revision ||
                currentOutreachSession()?.taskId !== session.taskId
            ) {
                return false
            }

            if (contextReady) {
                activeTask.value = { ...currentTask, phase: 'running' }
                applyWorkTask(workTask.task.value)
            }

            return true
        }

        restorePromise = restore().finally(() => {
            restorePromise = null
        })

        return restorePromise
    }

    async function applyTaskResult(task: ActiveOutreachTask, output: JsonObject) {
        if (task.kind === 'contact') {
            let input: ContactDiscoveryResult

            try {
                input = parseContactDiscoveryResult(output)
            } catch {
                failResult(task.revision, 'Work returned an invalid outreach result')
                return
            }

            if (postId.value !== task.postId) {
                finishTask(task)
                return
            }

            contactSaving.value = true

            try {
                const existingContact = contacts.value.find(
                    ({ profileUrl }) => profileUrl === input.profileUrl,
                )

                if (existingContact !== undefined) {
                    selectContact(existingContact)
                    finishTask(task)
                    resultError.value = null
                    return
                }

                const savedContact = await request(
                    `/job-posts/${encodeURIComponent(task.postId)}/outreach-contacts`,
                    parseOutreachContact,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(input),
                    },
                )

                if (
                    postId.value !== task.postId ||
                    resultRevision !== task.revision ||
                    activeTask.value?.revision !== task.revision
                ) {
                    return
                }

                contacts.value = [
                    savedContact,
                    ...contacts.value.filter(({ id }) => id !== savedContact.id),
                ]
                selectContact(savedContact)
                finishTask(task)
                resultError.value = null
            } catch (error) {
                if (
                    postId.value === task.postId &&
                    resultRevision === task.revision &&
                    activeTask.value?.revision === task.revision
                ) {
                    failResult(
                        task.revision,
                        error instanceof Error ? error.message : 'Could not save outreach contact',
                    )
                }
            } finally {
                if (postId.value === task.postId && resultRevision === task.revision) {
                    contactSaving.value = false
                }
            }
        } else {
            if (postId.value !== task.postId || contact.value?.id !== task.contactId) {
                finishTask(task)
                return
            }

            let result: DraftRevisionResult

            try {
                result = parseDraftRevisionResult(output)
            } catch {
                failResult(task.revision, 'Work returned an invalid draft result')
                return
            }

            draft.value = result.draftMessage
            assistantReply.value = result.response
            activeTask.value = { ...task, phase: 'settled' }
            resultError.value = null
        }
    }

    function finishTask(task: ActiveOutreachTask) {
        if (activeTask.value?.revision === task.revision) {
            activeTask.value = null

            if (sessionMatches(task)) {
                workTask.dismissSession()
            }
        }
    }

    function failResult(revision: number, message: string) {
        const task = activeTask.value

        if (task?.revision !== revision) {
            return
        }

        contactSaving.value = false
        resultError.value = message

        if (!sessionMatches(task)) {
            activeTask.value = null
        }
    }

    function clearTask(revision?: number) {
        if (revision !== undefined && activeTask.value?.revision !== revision) {
            return
        }

        resultRevision += 1
        activeTask.value = null
        contactSaving.value = false
        resultError.value = null
    }

    async function cancelActiveTask() {
        const activeResultRevision = activeTask.value?.revision

        if (activeResultRevision === undefined) {
            return false
        }

        const cancelledTask = await workTask.cancelTask()

        if (cancelledTask?.status !== 'cancelled') {
            return false
        }

        if (currentOutreachSession() === null) {
            clearTask(activeResultRevision)
        }

        return true
    }

    function dismissActiveTask() {
        const task = activeTask.value

        if (task === null) {
            return false
        }

        if (sessionMatches(task) && !workTask.dismissSession()) {
            return false
        }

        clearTask(task.revision)
        return true
    }

    function reset() {
        resultRevision += 1
        contactRequestRevision += 1
        contactUpdateRevision += 1
        activeTask.value = null
        postId.value = null
        contacts.value = []
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        contactSaving.value = false
        contactUpdating.value = false
        contactUpdateError.value = null
        resultError.value = null
        contactsLoading.value = false
        contactsError.value = null
    }

    function applyWorkTask(currentTask: WorkTask | null) {
        const task = activeTask.value

        if (
            task === null ||
            task.taskId === null ||
            task.phase !== 'running' ||
            currentTask?.id !== task.taskId ||
            currentTask.status === 'running'
        ) {
            return
        }

        if (currentTask.status === 'failed') {
            failResult(task.revision, currentTask.error ?? 'Outreach task failed')
            return
        }

        if (currentTask.status === 'cancelled') {
            return
        }

        if (currentTask.output === null) {
            failResult(task.revision, 'Work returned no outreach result')
            return
        }

        const applyingTask: ActiveOutreachTask = { ...task, phase: 'applying' }
        activeTask.value = applyingTask
        void applyTaskResult(applyingTask, currentTask.output)
    }

    watch(workTask.task, applyWorkTask, { immediate: true })

    return {
        postId,
        contacts,
        contact,
        draft,
        assistantReply,
        contactSaving,
        contactUpdating,
        contactUpdateError,
        resultError,
        contactsLoading,
        contactsError,
        discovering,
        drafting,
        hasActiveTask,
        openForPost,
        startContactDiscovery,
        restoreActiveTask,
        fetchContacts,
        selectContact,
        clearContact,
        updateContactMessaged,
        requestDraftRevision,
        cancelActiveTask,
        dismissActiveTask,
        reset,
    }
})
