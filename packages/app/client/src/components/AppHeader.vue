<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import { navigationRoutes } from '@/router'

const navigationItems = Object.values(navigationRoutes).map(({ meta, path }) => ({
    label: meta.title,
    path,
}))
const showNav = shallowRef(false)
const header = useTemplateRef<HTMLElement>('header')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')

function openNavigation() {
    showNav.value = true
}

function closeNavigation(restoreFocus = false) {
    showNav.value = false

    if (restoreFocus) {
        void nextTick(() => trigger.value?.focus())
    }
}

function toggleNavigation() {
    if (showNav.value) {
        closeNavigation(true)
    } else {
        openNavigation()
    }
}

function handleFocusOut(event: FocusEvent) {
    if (!header.value?.contains(event.relatedTarget as Node | null)) {
        closeNavigation()
    }
}
</script>

<template>
    <header
        ref="header"
        class="app-header"
        :class="{ 'is-open': showNav }"
        @mouseenter="openNavigation"
        @mouseleave="closeNavigation()"
        @focusout="handleFocusOut"
        @keydown.esc.prevent="closeNavigation(true)"
    >
        <button
            ref="trigger"
            class="nav-handle"
            type="button"
            data-testid="app-nav-trigger"
            aria-controls="primary-navigation"
            :aria-label="showNav ? 'Close navigation' : 'Open navigation'"
            :aria-expanded="showNav"
            @click="toggleNavigation"
        >
            <span class="nav-handle-bar" aria-hidden="true"></span>
        </button>

        <div class="nav-surface glass-frame" :inert="!showNav">
            <nav id="primary-navigation" class="nav-links" aria-label="Primary">
                <RouterLink
                    v-for="item in navigationItems"
                    :key="item.path"
                    class="link"
                    :to="item.path"
                    :data-testid="`nav-link-${item.path === '/' ? 'review' : item.path.slice(1)}`"
                    @click="closeNavigation()"
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
                @click="closeNavigation()"
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
        </div>
    </header>
</template>

<style scoped lang="scss">
$nav-surface-height: 4.25rem;

.app-header {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: calc(100vw - ($space-4 * 2));
    transform: translate(-50%, -$nav-surface-height);
    transition: transform 220ms ease;

    &.is-open {
        transform: translate(-50%, 0);
    }
}

.nav-surface {
    display: flex;
    order: 1;
    gap: calc($space-4 + 0.25rem);
    align-items: center;
    min-height: $nav-surface-height;
    padding: $space-3 calc($space-4 + 0.25rem);
    border-top: 0;
    border-radius: 0 0 $radius-lg $radius-lg;
}

.nav-handle {
    display: grid;
    order: 2;
    width: 10rem;
    height: 1.4rem;
    padding: 0;
    margin-top: -1px;
    cursor: pointer;
    background: $color-night-navigation-alpha-92;
    border: 1px solid $color-signal-light-alpha-22;
    border-top: 0;
    border-radius: 0 0 $radius-full $radius-full;
    box-shadow: 0 8px 20px $color-black-alpha-24;
    place-items: center;
    transition: height 140ms ease;

    &[aria-expanded='true'] {
        height: 0.75rem;
    }
}

.nav-handle-bar {
    width: 1.75rem;
    height: 0.1875rem;
    background: $color-ink-muted;
    border-radius: $radius-full;
    box-shadow: 0 0 10px $color-signal-alpha-24;
    transition:
        height 140ms ease,
        background-color 140ms ease;

    [aria-expanded='true'] & {
        height: 0.0625rem;
        background: $color-signal-light-alpha-50;
    }
}

.nav-links {
    display: flex;
    gap: calc($space-4 + 0.25rem);
    align-items: center;
}

.settings-link {
    display: grid;
    flex: 0 0 2rem;
    min-height: 2.5rem;
    margin-left: $space-3;
    place-items: center;
}

@media (width <= 420px) {
    .nav-surface,
    .nav-links {
        gap: $space-3;
    }

    .settings-link {
        margin-left: $space-1;
    }
}

.link {
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
