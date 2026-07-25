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
            <RouterLink
                class="brand"
                to="/"
                aria-label="Job Search Facilitator home"
                @click="closeNavigation()"
            >
                <span class="brand-mark" aria-hidden="true">JF</span>
            </RouterLink>

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
        </div>
    </header>
</template>

<style scoped lang="scss">
$nav-surface-height: 4.25rem;

.app-header {
    position: absolute;
    top: -$nav-surface-height;
    left: 50%;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: calc(100vw - ($space-4 * 2));
    transform: translateX(-50%);

    &.is-open {
        top: 0;
    }
}

.nav-surface {
    display: flex;
    order: 1;
    gap: $space-4;
    align-items: center;
    min-height: $nav-surface-height;
    padding: $space-3 $space-4 $space-3 $space-3;
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

    &:hover,
    &:focus-visible,
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

    [aria-expanded='true'] & {
        height: 0.0625rem;
        background: $color-signal-light-alpha-50;
    }
}

.brand {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    text-decoration: none;
}

.brand-mark {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    flex: 0 0 auto;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    place-items: center;
    background: $color-signal-alpha-12;
    border: 1px solid $color-signal-alpha-34;
    border-radius: $radius-md;
    box-shadow: inset 0 1px 0 $color-white-alpha-14;

    @media (forced-colors: active) {
        border: 1px solid ButtonText;
    }
}

.nav-links {
    display: flex;
    gap: $space-5;
    align-items: center;
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
