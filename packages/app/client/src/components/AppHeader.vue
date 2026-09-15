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
