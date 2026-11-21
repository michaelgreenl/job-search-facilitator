<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { shallowRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import NotificationItem from '@/components/notifications/NotificationItem.vue'
import { useNotificationStore } from '@/stores/notifications'

const notificationStore = useNotificationStore()
const { notifications } = storeToRefs(notificationStore)
// The notifications that this visit marked as read keep their "New" tag until the page closes.
const newIds = shallowRef<string[]>([])
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

watch(
    notifications,
    (current) => {
        const unreadIds = current.filter(({ read }) => !read).map(({ id }) => id)

        if (unreadIds.length > 0) {
            newIds.value = [...newIds.value, ...unreadIds]
            notificationStore.markRead(unreadIds)
        }
    },
    { immediate: true },
)
</script>

<template>
    <main class="notifications glass-frame" data-testid="notifications-page">
        <header class="page-heading">
            <h1>Notifications</h1>
            <BaseButton
                v-if="notifications.length > 0"
                preset="text"
                data-testid="clear-notifications"
                @click="notificationStore.clear(notifications.map(({ id }) => id))"
            >
                Clear all
            </BaseButton>
        </header>
        <p v-if="notifications.length === 0" class="empty-message">No notifications.</p>
        <ul v-else class="notification-list">
            <li
                v-for="notification in notifications"
                :key="notification.id"
                class="notification-row"
                :data-testid="`notification-${notification.id}`"
            >
                <div class="card">
                    <NotificationItem class="row-item" :notification="notification">
                        <span v-if="newIds.includes(notification.id)" class="new-tag">New</span>
                        <time class="time" :datetime="notification.createdAt">{{
                            dateFormat.format(new Date(notification.createdAt))
                        }}</time>
                    </NotificationItem>
                    <BaseButton
                        class="clear-button"
                        preset="text"
                        aria-label="Clear notification"
                        data-testid="notification-clear"
                        @click="notificationStore.clear([notification.id])"
                    >
                        Clear
                    </BaseButton>
                </div>
            </li>
        </ul>
    </main>
</template>

<style scoped lang="scss">
.notifications {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    max-width: 60rem;
    max-height: calc(100dvh - $app-header-height - ($space-3 * 3));
    min-height: 0;
    align-self: center;
    padding: $space-5;
    border-radius: $radius-lg;

    @media (width <= 42rem) {
        padding: $space-4;
    }
}

.page-heading {
    display: flex;
    gap: $space-4;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $space-5;
    padding-bottom: $space-4;
    border-bottom: 1px solid $color-ink-alpha-12;
}

h1 {
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
}

.empty-message {
    padding: 0 0.2rem;
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.notification-list {
    min-height: 0;
    padding: 0 $space-2;
    margin: 0;
    overflow-y: auto;
    list-style: none;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.notification-row {
    padding: $space-2 0;

    & + & {
        border-top: 1px solid $color-ink-alpha-9;
    }
}

// The hover area keeps the same gap to the list border and to the separators.
.card {
    position: relative;
    border-radius: $radius-md;
    transition: background-color 140ms ease;

    &:hover,
    &:has(:focus-visible) {
        background: $color-ink-alpha-5;
    }
}

.row-item {
    --notification-action-inset: 3.5rem;

    padding: $space-3;
    border-radius: $radius-md;
}

// The button shows with the pointer or the keyboard focus, and always on a touch screen.
.clear-button {
    position: absolute;
    right: $space-3;
    bottom: $space-3;
    font-size: 0.8125rem;
    line-height: 1.4;
    opacity: 0;
    transition: opacity 140ms ease;

    &:focus-visible,
    .card:hover & {
        opacity: 1;
    }

    @media (hover: none) {
        opacity: 1;
    }
}

.new-tag {
    padding: 0 $space-2;
    color: $color-night-deep;
    font-size: 0.6875rem;
    font-weight: 700;
    line-height: 1.125rem;
    background: $color-signal;
    border-radius: $radius-full;
}

.time {
    margin-left: auto;
    color: $color-ink-muted;
    font-size: 0.8125rem;
    white-space: nowrap;
}
</style>
