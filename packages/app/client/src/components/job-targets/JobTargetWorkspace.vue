<script setup lang="ts">
import JobTargetDetail from './JobTargetDetail.vue'
import JobTargetFilters from './JobTargetFilters.vue'
import JobTargetList from './JobTargetList.vue'
import JobTargetStats from './JobTargetStats.vue'
</script>

<template>
    <section id="workspace" class="workspace" aria-label="Job search workspace" tabindex="-1">
        <JobTargetStats />
        <JobTargetFilters />

        <div class="content-grid">
            <JobTargetList />
            <JobTargetDetail />
        </div>
    </section>
</template>
