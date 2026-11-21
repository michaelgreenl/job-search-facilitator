<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '@/stores/notifications'
import NotificationBanner from './NotificationBanner.vue'

const notificationStore = useNotificationStore()
const { banners } = storeToRefs(notificationStore)

useIntervalFn(() => void notificationStore.refreshUpdates(), 60_000, { immediateCallback: true })
</script>

<template>
    <TransitionGroup
        tag="ul"
        name="banner"
        class="notification-banners"
        aria-label="New notifications"
        aria-live="polite"
        data-testid="notification-banners"
    >
        <NotificationBanner
            v-for="notification in banners"
            :key="notification.id"
            :notification="notification"
        />
    </TransitionGroup>
</template>

<style scoped lang="scss">
.notification-banners {
    position: fixed;
    top: $space-3;
    right: $space-3;
    z-index: 2;
    width: min(22rem, calc(100vw - (#{$space-3} * 2)));
    padding: 0;
    margin: 0;
    pointer-events: none;
    list-style: none;
}

.banner-enter-active,
.banner-leave-active,
.banner-move {
    transition:
        opacity 200ms ease,
        transform 200ms ease;
}

.banner-enter-from,
.banner-leave-to {
    opacity: 0;
    transform: translateX($space-5);
}

// A leaving banner leaves the flow, so the banners below it move up at once.
.banner-leave-active {
    position: absolute;
    width: 100%;
}
</style>
