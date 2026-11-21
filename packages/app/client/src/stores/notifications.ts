import type { IsoDateTime, JobPost, RecordedJobUpdate } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { router } from '@/router'
import { changeRecordedJobUpdates, fetchRecordedJobUpdates } from '@/services/job-posts'
import { useAgentStore, type AgentSession } from './agent'
import { useJobPostImportStore } from './job-post-import'
import { useOutreachStore } from './outreach'
import { usePostStore } from './post'

interface NotificationContent {
    id: string
    title: string
    message: string
    createdAt: IsoDateTime
    read: boolean
}

export type AppNotification = NotificationContent &
    (
        | { kind: 'application-update'; postId: string }
        | { kind: 'permission'; session: AgentSession; screen: string }
    )

/** The route that shows the Agent stream of a session. */
const sessionScreen = (session: AgentSession, post: JobPost | null) =>
    session.kind === 'job-post-import'
        ? 'review'
        : post !== null && post.applicationStatus !== 'not-applied'
          ? 'track'
          : 'apply'

export const useNotificationStore = defineStore('notifications', () => {
    const agentStore = useAgentStore()
    const postStore = usePostStore()
    const updates = shallowRef<RecordedJobUpdate[]>([])
    // The changes of this session. They apply before the server returns them in its list.
    const readIds = shallowRef<string[]>([])
    const clearedIds = shallowRef<string[]>([])
    const bannerIds = shallowRef<string[]>([])
    // A change of this number loads the current screen again.
    const screenVisit = shallowRef(0)
    const announcedPermissionIds = new Set<string>()
    // Null until the first list arrives. That list raises no banners.
    let knownUpdateIds: Set<string> | null = null

    const pendingPermissions = computed(() =>
        agentStore.sessions.flatMap((session) => {
            const state = agentStore.getTaskState(session.taskId)
            const permission = state?.pendingPermission

            if (state === null || permission == null || state.alwaysAllowBrowserActions) {
                return []
            }

            const request = state.events
                .filter((event) => event.type === 'permission-required')
                .at(-1)
            const post =
                session.kind === 'job-post-import' ? null : postStore.findPost(session.postId)

            return request === undefined
                ? []
                : [
                      {
                          id: permission.id,
                          kind: 'permission' as const,
                          title:
                              session.kind === 'job-post-import'
                                  ? 'Job post import'
                                  : post === null
                                    ? 'Outreach'
                                    : `${post.company} · ${post.roleTitle}`,
                          message: permission.message,
                          createdAt: request.createdAt,
                          read: false,
                          session,
                          screen: sessionScreen(session, post),
                      },
                  ]
        }),
    )
    const notifications = computed<AppNotification[]>(() =>
        [
            ...pendingPermissions.value,
            ...updates.value.map((update) => ({
                id: update.id,
                kind: 'application-update' as const,
                title: `${update.company} · ${update.roleTitle}`,
                message: update.summary,
                createdAt: update.occurredAt,
                read: update.read,
                postId: update.jobPostId,
            })),
        ]
            .filter(({ id }) => !clearedIds.value.includes(id))
            .map((item) => ({ ...item, read: item.read || readIds.value.includes(item.id) }))
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    )
    const unreadCount = computed(() => notifications.value.filter(({ read }) => !read).length)
    const banners = computed(() =>
        bannerIds.value.flatMap((id) => notifications.value.find((item) => item.id === id) ?? []),
    )

    /** Puts the banners at the top of the stack in the given order. */
    function showBanners(ids: string[]) {
        if (ids.length > 0) {
            bannerIds.value = [...ids, ...bannerIds.value.filter((id) => !ids.includes(id))]
        }
    }

    function dismissBanner(id: string) {
        bannerIds.value = bannerIds.value.filter((bannerId) => bannerId !== id)
    }

    /** Applies a change to the given notifications and saves it for the application updates. */
    function change(ids: string[], state: 'read' | 'cleared') {
        const changed = notifications.value.filter(
            ({ id, read }) => ids.includes(id) && !(state === 'read' && read),
        )

        if (changed.length === 0) {
            return
        }

        const changedIds = changed.map(({ id }) => id)
        const savedIds = changed
            .filter(({ kind }) => kind === 'application-update')
            .map(({ id }) => id)
        const sessionIds = state === 'read' ? readIds : clearedIds
        sessionIds.value = [...sessionIds.value, ...changedIds]
        bannerIds.value = bannerIds.value.filter((id) => !changedIds.includes(id))

        if (savedIds.length > 0) {
            // A change that is not saved applies until the page reloads.
            void changeRecordedJobUpdates({ ids: savedIds, state }).catch(() => undefined)
        }
    }

    const markRead = (ids: string[]) => change(ids, 'read')
    const clear = (ids: string[]) => change(ids, 'cleared')

    async function refreshUpdates() {
        let latest: RecordedJobUpdate[]

        try {
            latest = await fetchRecordedJobUpdates()
        } catch {
            // The next refresh tries again.
            return
        }

        const known = knownUpdateIds
        updates.value = latest
        knownUpdateIds = new Set([...(known ?? []), ...latest.map(({ id }) => id)])

        if (known !== null) {
            showBanners(
                latest.filter(({ id, read }) => !read && !known.has(id)).map(({ id }) => id),
            )
        }
    }

    /** Opens the screen of a notification. The notification is then complete. */
    function open(notification: AppNotification) {
        clear([notification.id])

        if (notification.kind === 'application-update') {
            return router.push({ name: 'track', query: { post: notification.postId } })
        }

        const { session } = notification

        if (session.kind === 'job-post-import') {
            useJobPostImportStore().selectTask(session.taskId)
        } else {
            useOutreachStore().openTask(session.taskId)
        }

        // A screen opens the selected task when it loads, so an open screen must load again.
        if (router.currentRoute.value.name === notification.screen) {
            screenVisit.value += 1
            return
        }

        return router.push({ name: notification.screen })
    }

    watch(
        pendingPermissions,
        (pending) => {
            const newIds = pending
                .map(({ id }) => id)
                .filter((id) => !announcedPermissionIds.has(id))

            for (const id of newIds) {
                announcedPermissionIds.add(id)
            }

            showBanners(newIds)
        },
        { immediate: true },
    )

    // A closed application or a forgone post removes its updates from the list of the server.
    postStore.$onAction(({ name, after }) => {
        if (name === 'updatePost') {
            after(() => void refreshUpdates())
        }
    })

    return {
        notifications,
        unreadCount,
        banners,
        screenVisit,
        dismissBanner,
        markRead,
        clear,
        refreshUpdates,
        open,
    }
})
