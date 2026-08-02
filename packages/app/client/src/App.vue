<script setup lang="ts">
import { computed, onErrorCaptured, shallowRef } from 'vue'
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { navigationFailed } from '@/router'

const descendantFailed = shallowRef(false)
const applicationFailed = computed(() => descendantFailed.value || navigationFailed.value)

onErrorCaptured(() => {
    descendantFailed.value = true
})

function reloadDocument() {
    window.location.reload()
}
</script>

<template>
    <div class="ambient-backdrop" aria-hidden="true"></div>

    <div class="app-shell">
        <main
            v-if="applicationFailed"
            class="error-recovery glass-frame"
            data-testid="app-error-recovery"
        >
            <div class="error-summary" role="alert">
                <h1 class="error-title">The interface could not continue</h1>
                <p class="error-message">Reload the page to restore a clean application state.</p>
            </div>
            <BaseButton class="error-reload" data-testid="app-error-reload" @click="reloadDocument">
                Reload page
            </BaseButton>
        </main>

        <template v-else>
            <AppHeader />

            <RouterView v-slot="{ Component }">
                <component :is="Component" />
            </RouterView>
        </template>
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

.error-recovery {
    display: grid;
    width: min(100%, 36rem);
    gap: $space-4;
    align-self: center;
    padding: $space-6;
    margin: auto;
}

.error-summary {
    display: grid;
    gap: $space-4;
}

.error-title,
.error-message {
    margin: 0;
}

.error-title {
    font-size: clamp(1.5rem, 4vw, 2rem);
}

.error-message {
    color: $color-ink-secondary;
}

.error-reload {
    width: fit-content;
}
</style>
