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
import { createContactDiscoveryTask, createDraftRevisionTask } from '@/work-tasks'
import { useWorkStore } from './work.store'

type OutreachTaskKind = 'contact' | 'draft'
type OutreachTaskPhase = 'starting' | 'running' | 'applying'

interface ActiveOutreachTask {
    revision: number
    kind: OutreachTaskKind
    postId: string
    contactId: string | null
    taskId: string | null
    phase: OutreachTaskPhase
}

export const useOutreachStore = defineStore('outreach', () => {
    const workStore = useWorkStore()
    const postId = shallowRef<string | null>(null)
    const contacts = shallowRef<OutreachContact[]>([])
    const contact = shallowRef<OutreachContact | null>(null)
    const draft = shallowRef('')
    const assistantReply = shallowRef<string | null>(null)
    const activeTask = shallowRef<ActiveOutreachTask | null>(null)
    const contactSaving = shallowRef(false)
    const contactUpdating = shallowRef(false)
    const contactUpdateError = shallowRef<string | null>(null)
    const resultError = shallowRef<string | null>(null)
    const contactsLoading = shallowRef(false)
    const contactsError = shallowRef<string | null>(null)
    const discovering = computed(() => activeTask.value?.kind === 'contact')
    const drafting = computed(() => activeTask.value?.kind === 'draft')
    let resultRevision = 0
    let contactRequestRevision = 0
    let contactUpdateRevision = 0

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

    async function startTask(task: ActiveOutreachTask, input: StartWorkTaskInput) {
        activeTask.value = task

        try {
            const startedTask = await workStore.startTask(input)
            const currentTask = activeTask.value

            if (
                currentTask?.revision !== task.revision ||
                currentTask.phase !== 'starting' ||
                !taskContextMatches(currentTask)
            ) {
                if (workStore.task?.id === startedTask.id && workStore.task.status === 'running') {
                    await workStore.cancelTask().catch(() => undefined)
                }

                return false
            }

            activeTask.value = {
                ...currentTask,
                taskId: startedTask.id,
                phase: 'running',
            }
            applyWorkTask(workStore.task)
            return true
        } catch (error) {
            if (activeTask.value?.revision === task.revision) {
                clearTask(task.revision)
            }

            throw error
        }
    }

    async function startContactDiscovery(post: JobPost) {
        if (
            workStore.taskActive ||
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
            workStore.taskActive
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
        )
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
                finishTask(task.revision)
                return
            }

            contactSaving.value = true

            try {
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
                finishTask(task.revision)
                resultError.value = null
            } catch (error) {
                if (
                    postId.value === task.postId &&
                    resultRevision === task.revision &&
                    activeTask.value?.revision === task.revision
                ) {
                    finishTask(task.revision)
                    resultError.value =
                        error instanceof Error ? error.message : 'Could not save outreach contact'
                }
            } finally {
                if (postId.value === task.postId && resultRevision === task.revision) {
                    contactSaving.value = false
                }
            }
        } else {
            if (postId.value !== task.postId || contact.value?.id !== task.contactId) {
                finishTask(task.revision)
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
            finishTask(task.revision)
            resultError.value = null
        }
    }

    function finishTask(revision: number) {
        if (activeTask.value?.revision === revision) {
            activeTask.value = null
        }
    }

    function failResult(revision: number, message: string) {
        if (activeTask.value?.revision !== revision) {
            return
        }

        activeTask.value = null
        contactSaving.value = false
        resultError.value = message
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

        const cancelledTask = await workStore.cancelTask()

        if (cancelledTask?.status !== 'cancelled') {
            return false
        }

        clearTask(activeResultRevision)
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

        if (currentTask.status === 'failed' || currentTask.status === 'cancelled') {
            clearTask(task.revision)
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

    watch(() => workStore.task, applyWorkTask)

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
        openForPost,
        startContactDiscovery,
        fetchContacts,
        selectContact,
        clearContact,
        updateContactMessaged,
        requestDraftRevision,
        cancelActiveTask,
        reset,
    }
})
