<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { navigationRoutes } from '@/router'

const navigationItems = Object.values(navigationRoutes).map(({ meta, path }) => ({
    label: meta.title,
    path,
}))
</script>

<template>
    <header class="app-header glass-frame" data-testid="app-header">
        <nav class="nav-links" aria-label="Primary">
            <RouterLink
                v-for="item in navigationItems"
                :key="item.path"
                class="link"
                :to="item.path"
                :data-testid="`nav-link-${item.path === '/' ? 'review' : item.path.slice(1)}`"
            >
                {{ item.label }}
            </RouterLink>
        </nav>

        <RouterLink
            class="settings-link link"
            to="/settings"
            aria-label="Settings"
            title="Settings"
            data-testid="nav-link-settings"
        >
            <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
            >
                <path
                    d="m9 3-.6 2.4-2.1 1.2L4 6l-2 3.5 1.8 1.7v2.5L2 15.5 4 19l2.3-.6 2.1 1.2L9 22h4l.6-2.4 2.1-1.2 2.3.6 2-3.5-1.8-1.8v-2.5L20 9.5 18 6l-2.3.6-2.1-1.2L13 3Z"
                />
                <circle cx="11" cy="12.5" r="3" />
            </svg>
        </RouterLink>
    </header>
</template>

<style scoped lang="scss">
.app-header {
    position: fixed;
    inset: 0 0 auto;
    z-index: 10;
    display: flex;
    align-items: center;
    height: $app-header-height;
    padding-inline: $space-3;
    background: $color-night-navigation-alpha-92;
    border-width: 0 0 1px;
}

.nav-links {
    display: flex;
    gap: $space-1;
    align-items: center;
}

.settings-link {
    margin-left: auto;
}

.link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: $space-2 $space-3;
    color: $color-ink-muted;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    border-radius: $radius-sm;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-ink-alpha-5;
    }

    &:active,
    &.router-link-exact-active {
        color: $color-signal-light;
        background: $color-signal-alpha-12;
    }
}
</style>
