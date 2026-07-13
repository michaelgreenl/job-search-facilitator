<script setup lang="ts">
import AppHeader from '@/components/app/AppHeader.vue'
import JobTargetWorkspace from '@/components/job-targets/JobTargetWorkspace.vue'
</script>

<template>
    <a class="skip-link" href="#workspace">Skip to workspace</a>

    <main class="app">
        <AppHeader />
        <JobTargetWorkspace />
    </main>
</template>
