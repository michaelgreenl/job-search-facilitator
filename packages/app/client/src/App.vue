<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/app/AppHeader.vue'
</script>

<template>
    <div class="ambient-backdrop" aria-hidden="true"></div>

    <div class="app-shell">
        <AppHeader />

        <RouterView v-slot="{ Component }">
            <component :is="Component" />
        </RouterView>
    </div>
</template>

<style scoped lang="scss">
.ambient-backdrop {
    position: fixed;
    inset: -30%;
    z-index: 0;
    pointer-events: none;
    background: linear-gradient(
        118deg,
        transparent 35%,
        rgb(173 123 249 / 4%) 43%,
        rgb(173 123 249 / 18%) 50%,
        rgb(173 123 249 / 5%) 57%,
        transparent 67%
    );
    filter: blur(76px);
    transform: rotate(-5deg);
}

.app-shell {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    min-height: 100dvh;
    padding: $space-4;
}

.skip-link {
    position: fixed;
    inset-block-start: $space-3;
    inset-inline-start: $space-3;
    z-index: 20;
    padding: $space-2 $space-3;
    color: $color-night-deep;
    font-size: 0.8125rem;
    font-weight: 700;
    text-decoration: none;
    background: $color-signal-light;
    border-radius: $radius-sm;
    transform: translateY(calc(-100% - $space-4));
}

.skip-link:focus {
    transform: translateY(0);
}

.workspace {
    width: min(100%, 76rem);
    margin-inline: auto;
    padding-block: clamp($space-5, 4vw, $space-7);
}

@include bp-max('sm') {
    .app-shell {
        padding: $space-3;
    }
}
</style>
