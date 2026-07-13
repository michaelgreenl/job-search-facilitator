<script setup lang="ts">
import AppHeader from '@/components/app/AppHeader.vue'
import WorkspaceDraft from '@/components/layout/WorkspaceDraft.vue'
</script>

<template>
    <div class="ambient-backdrop" aria-hidden="true"></div>

    <a class="skip-link" href="#workspace">Skip to layout</a>

    <div class="app-shell">
        <AppHeader />

        <main id="workspace" class="workspace" tabindex="-1">
            <WorkspaceDraft />
        </main>
    </div>
</template>
