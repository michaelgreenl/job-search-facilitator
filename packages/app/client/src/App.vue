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
        $color-signal-alpha-4 43%,
        $color-signal-alpha-18 50%,
        $color-signal-alpha-5 57%,
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
    gap: $space-4;
    min-height: 100dvh;
    padding: $space-3;

    @include bp-max('sm') {
        padding: $space-3;
    }
}
</style>
