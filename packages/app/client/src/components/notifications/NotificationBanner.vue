<script setup lang="ts">
import { useElementHover, useFocusWithin, useTimeoutFn } from '@vueuse/core'
import { computed, useTemplateRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { useNotificationStore, type AppNotification } from '@/stores/notifications'
import NotificationItem from './NotificationItem.vue'

const props = defineProps<{
    notification: AppNotification
}>()

const duration = 7_000
const notificationStore = useNotificationStore()
const banner = useTemplateRef<HTMLElement>('banner')
const hovered = useElementHover(banner)
const { focused } = useFocusWithin(banner)
// The timer waits while the pointer or the keyboard focus is on the banner.
const paused = computed(() => hovered.value || focused.value)
const dismiss = () => notificationStore.dismissBanner(props.notification.id)
let remaining = duration
let startedAt = Date.now()
const { start, stop } = useTimeoutFn(dismiss, () => remaining)

watch(paused, (isPaused) => {
    if (isPaused) {
        remaining -= Date.now() - startedAt
        stop()
    } else {
        startedAt = Date.now()
        start()
    }
})
</script>

<template>
    <li
        ref="banner"
        class="notification-banner glass-frame"
        :class="{ 'is-paused': paused }"
        :data-testid="`notification-banner-${notification.id}`"
    >
        <NotificationItem class="banner-item" :notification="notification" compact />
        <BaseButton
            class="dismiss-button"
            preset="icon"
            icon-size="sm"
            aria-label="Dismiss notification"
            data-testid="notification-banner-dismiss"
            @click="dismiss"
        >
            <svg class="action-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 4 8 8m0-8-8 8" />
            </svg>
        </BaseButton>
        <span
            class="timer-bar"
            :style="{ animationDuration: `${duration}ms` }"
            aria-hidden="true"
        ></span>
    </li>
</template>

<style scoped lang="scss">
.notification-banner {
    position: relative;
    display: flex;
    gap: $space-2;
    padding: $space-2 $space-2 calc(#{$space-2} + 2px) $space-4;
    overflow: hidden;
    pointer-events: auto;
    border-radius: $radius-lg;

    & + & {
        margin-top: $space-2;
    }
}

.banner-item {
    align-self: center;
    padding-block: $space-1;
}

.dismiss-button {
    flex-shrink: 0;
    align-self: flex-start;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        color: $color-ink;
    }
}

.action-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
}

// The bar shows the time that remains before the banner leaves.
.timer-bar {
    position: absolute;
    inset: auto 0 0;
    height: 2px;
    background: $color-signal-light;
    transform-origin: left;
    animation: banner-timer linear forwards;

    .is-paused & {
        animation-play-state: paused;
    }
}

@keyframes banner-timer {
    to {
        transform: scaleX(0);
    }
}
</style>
