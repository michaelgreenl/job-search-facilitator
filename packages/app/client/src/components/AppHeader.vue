<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const showNav = ref(false)
</script>

<template>
    <header
        class="app-header glass-frame"
        @mouseenter="showNav = true"
        @mouseleave="showNav = false"
    >
        <a class="brand" href="/" aria-label="Job Search Facilitator home">
            <span class="brand-mark" aria-hidden="true">JF</span>
        </a>

        <div v-if="showNav" class="nav-links">
            <RouterLink class="link" to="/">Review</RouterLink>
            <RouterLink class="link" to="/apply">Apply</RouterLink>
            <RouterLink class="link" to="/results">Results</RouterLink>
        </div>
    </header>
</template>

<style scoped lang="scss">
.app-header {
    position: absolute;
    top: -$space-5;
    right: 48.25%;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-inline: auto;
    padding: $space-2;
    border-radius: $radius-lg;

    &:hover {
        gap: $space-4;
        top: $space-1;
        right: 42%;
    }
}

.brand {
    display: inline-flex;
    gap: $space-3;
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
    background: rgb(173 123 249 / 12%);
    border: 1px solid rgb(173 123 249 / 34%);
    border-radius: $radius-md;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 14%);

    @media (forced-colors: active) {
        border: 1px solid ButtonText;
    }
}

.brand-copy {
    display: grid;
    gap: 0.125rem;
    min-width: 0;

    strong {
        overflow: hidden;
        font-size: 0.875rem;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    small {
        color: $color-ink-muted;
        font-size: 0.6875rem;

        @include bp-max('xs') {
            display: none;
        }

        @media (prefers-contrast: more) {
            color: $color-ink;
        }
    }
}

.nav-links {
    display: flex;
    gap: $space-5;
    align-items: center;
    padding-right: $space-3;
}

.link {
    color: $color-ink-muted;
    text-decoration: none;

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
