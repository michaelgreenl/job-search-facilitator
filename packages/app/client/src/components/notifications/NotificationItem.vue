<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationStore, type AppNotification } from '@/stores/notifications'

const props = defineProps<{
    notification: AppNotification
    /** Limits the message to 2 lines. */
    compact?: boolean
}>()

defineSlots<{
    /** Shown at the end of the label line. */
    default?(): unknown
}>()

const notificationStore = useNotificationStore()
const kindLabels = {
    'application-update': 'Application update',
    permission: 'Permission needed',
} satisfies Record<AppNotification['kind'], string>
// A word joiner on each side of a symbol keeps a link on one line. The message wraps at spaces.
const message = computed(() =>
    props.notification.message.replace(
        /(?<=\S)(?=[^\p{L}\p{N}\s])|(?<=[^\p{L}\p{N}\s])(?=\S)/gu,
        '\u2060',
    ),
)
</script>

<template>
    <button
        class="notification-item"
        :class="{ 'is-compact': compact }"
        type="button"
        @click="notificationStore.open(notification)"
    >
        <span class="label-line">
            <span class="kind-label">{{ kindLabels[notification.kind] }}</span>
            <slot />
        </span>
        <span class="title">{{ notification.title }}</span>
        <span class="message">{{ message }}</span>
    </button>
</template>

<style scoped lang="scss">
.notification-item {
    display: grid;
    width: 100%;
    min-width: 0;
    gap: $space-1;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: $radius-sm;
}

.label-line {
    display: flex;
    flex-wrap: wrap;
    gap: $space-1 $space-2;
    align-items: center;
}

.kind-label {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
}

.title {
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.message {
    color: $color-ink-secondary;
    font-size: 0.8125rem;
    line-height: 1.4;
    overflow-wrap: anywhere;

    // A parent can keep the end of the message clear of a control that it puts there.
    padding-right: var(--notification-action-inset, 0);

    .is-compact & {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
    }
}
</style>
