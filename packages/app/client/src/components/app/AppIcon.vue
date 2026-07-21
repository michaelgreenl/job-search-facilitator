<script lang="ts">
export type AppIconName =
    | 'agent'
    | 'back'
    | 'chevron-down'
    | 'chevron-right'
    | 'collapse'
    | 'copy'
    | 'expand'
    | 'external-link'
    | 'globe'
    | 'loader'
    | 'send'
    | 'tool'
</script>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })

defineProps<{
    name: AppIconName
}>()
</script>

<template>
    <svg
        v-bind="$attrs"
        class="app-icon"
        :class="`app-icon-${name}`"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
    >
        <template v-if="name === 'agent'">
            <path
                d="M12 3c.5 3.7 2.3 5.5 6 6-3.7.5-5.5 2.3-6 6-.5-3.7-2.3-5.5-6-6 3.7-.5 5.5-2.3 6-6Z"
            />
        </template>
        <template v-else-if="name === 'back'">
            <path d="M19 12H5" />
            <path d="m11 18-6-6 6-6" />
        </template>
        <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" />
        <path v-else-if="name === 'chevron-right'" d="m9 6 6 6-6 6" />
        <template v-else-if="name === 'collapse'">
            <path d="M4 10h6V4" />
            <path d="M20 14h-6v6" />
        </template>
        <template v-else-if="name === 'copy'">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
        </template>
        <template v-else-if="name === 'expand'">
            <path d="M10 4H4v6" />
            <path d="M14 20h6v-6" />
        </template>
        <template v-else-if="name === 'external-link'">
            <path d="M14 5h5v5" />
            <path d="m19 5-8 8" />
            <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </template>
        <template v-else-if="name === 'globe'">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </template>
        <path v-else-if="name === 'loader'" d="M20 12a8 8 0 1 1-2.34-5.66" />
        <template v-else-if="name === 'send'">
            <path d="M12 19V5" />
            <path d="m6 11 6-6 6 6" />
        </template>
        <path
            v-else
            d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"
        />
    </svg>
</template>

<style scoped lang="scss">
.app-icon {
    display: block;
    flex: 0 0 auto;
    width: 1em;
    height: 1em;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;

    &-loader {
        animation: app-icon-spin 0.8s linear infinite;
    }
}

@keyframes app-icon-spin {
    to {
        transform: rotate(1turn);
    }
}
</style>
