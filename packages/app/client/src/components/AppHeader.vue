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
    inset: $space-3 $space-3 auto;
    z-index: 10;
    display: flex;
    align-items: center;
    height: $app-header-height;
    padding-inline: $space-5;
    border-radius: $radius-lg;
}

.nav-links {
    display: flex;
    gap: calc($space-4 + 0.25rem);
    align-items: center;
}

.link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    color: $color-ink-muted;
    text-decoration: none;
    white-space: nowrap;

    &:hover,
    &:focus-visible {
        color: $color-ink;
    }

    &:active,
    &.router-link-exact-active {
        color: $color-signal-light;
    }
}
</style>
