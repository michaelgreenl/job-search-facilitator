<script setup lang="ts">
import type { JobSearchReport, JobSearchResult } from '@job-search-facilitator/core'
import { onMounted, shallowRef } from 'vue'
import { useReportStore } from '@/stores/report.store'
import JobPostCard from '@/components/job-post/JobPostCard.vue'
import JobPostViewer from '@/components/job-post/JobPostViewer.vue'
import SearchReportCard from '@/components/search-report/SearchReportCard.vue'

type ActivePanel = 'reports' | 'posts' | 'viewer'

const reportStore = useReportStore()
const activePanel = shallowRef<ActivePanel>('reports')
const selectedReport = shallowRef<JobSearchReport | null>(null)
const selectedResult = shallowRef<JobSearchResult | null>(null)

function selectReport(report: JobSearchReport) {
    selectedReport.value = report
    selectedResult.value = report.results[0] ?? null
    activePanel.value = 'posts'
}

function selectResult(result: JobSearchResult) {
    selectedResult.value = result
    activePanel.value = 'viewer'
}

function showReports() {
    activePanel.value = 'reports'
}

function showPosts() {
    activePanel.value = 'posts'
}

onMounted(() => {
    void reportStore
        .fetchReports()
        .then(() => {
            selectedReport.value = reportStore.reports[0] ?? null
            selectedResult.value = selectedReport.value?.results[0] ?? null
        })
        .catch(() => undefined)
})
</script>

<template>
    <section class="layout-draft" aria-label="Job search review">
        <!-- TODO: search-report statistics while the search-report list is active (e.g. "Last Run", "Report Count", keep it simple) -->
        <!-- <section class="layout-overview glass-frame" aria-label="Overview frame"> -->
        <!--     <div class="placeholder-cluster" aria-hidden="true"> -->
        <!--         <span class="placeholder-line placeholder-line-short"></span> -->
        <!--         <span class="placeholder-line placeholder-line-long"></span> -->
        <!--     </div> -->
        <!--     <div class="placeholder-cluster" aria-hidden="true"> -->
        <!--         <span class="placeholder-line placeholder-line-short"></span> -->
        <!--         <span class="placeholder-line placeholder-line-medium"></span> -->
        <!--     </div> -->
        <!--     <div class="placeholder-cluster" aria-hidden="true"> -->
        <!--         <span class="placeholder-line placeholder-line-short"></span> -->
        <!--         <span class="placeholder-line placeholder-line-long"></span> -->
        <!--     </div> -->
        <!-- </section> -->

        <div class="layout-panels">
            <section
                class="layout-panel glass-frame"
                :class="{ 'is-active': activePanel === 'reports' }"
                aria-label="Search reports"
            >
                <header class="panel-heading">
                    <div class="panel-title">
                        <span class="eyebrow">Job Search reports</span>
                        <h2 class="panel-heading-title">Select report to review</h2>
                    </div>

                    <span class="item-count">{{ reportStore.reports.length }} reports</span>
                </header>

                <p v-if="reportStore.loading" class="list-message">Loading search reports…</p>
                <p v-else-if="reportStore.error" class="list-message">
                    {{ reportStore.error }}
                </p>
                <ul v-else-if="reportStore.reports.length" class="card-list">
                    <li v-for="report in reportStore.reports" :key="report.id">
                        <SearchReportCard
                            :report="report"
                            :selected="selectedReport?.id === report.id"
                            @select="selectReport(report)"
                        />
                    </li>
                </ul>
                <p v-else class="list-message">No search reports found.</p>
            </section>

            <section
                class="layout-panel glass-frame"
                :class="{
                    'is-active': activePanel === 'posts',
                    'is-adjacent': activePanel === 'reports' || activePanel === 'viewer',
                }"
                aria-label="Job posts"
            >
                <header class="panel-heading">
                    <div class="panel-title">
                        <button
                            v-if="activePanel !== 'reports'"
                            class="back-button"
                            type="button"
                            aria-label="Back to search reports"
                            @click="showReports"
                        >
                            ←
                        </button>
                        <span class="eyebrow">Job posts</span>
                        <h2 class="panel-heading-title">
                            {{ selectedReport?.reportDate ?? 'Select a search report' }}
                        </h2>
                    </div>

                    <span class="item-count">{{ selectedReport?.results.length ?? 0 }} posts</span>
                </header>

                <ul v-if="selectedReport?.results.length" class="card-list">
                    <li v-for="result in selectedReport.results" :key="result.post.id">
                        <JobPostCard
                            :result="result"
                            :selected="selectedResult?.post.id === result.post.id"
                            @select="selectResult(result)"
                        />
                    </li>
                </ul>
                <p v-else class="list-message">
                    {{
                        selectedReport ? 'This report has no job posts.' : 'Select a search report.'
                    }}
                </p>
            </section>

            <aside
                v-if="selectedResult"
                class="layout-panel layout-viewer glass-frame"
                :class="{
                    'is-active': activePanel === 'viewer',
                    'is-adjacent': activePanel === 'posts',
                }"
            >
                <button
                    class="back-button viewer-back-button"
                    type="button"
                    aria-label="Back to job posts"
                    @click="showPosts"
                >
                    ←
                </button>
                <JobPostViewer :result="selectedResult" />
            </aside>
        </div>
    </section>
</template>

<style scoped lang="scss">
.layout-draft {
    display: flex;
    flex-direction: column;
    gap: $space-4;
    width: min(100%, 84rem);
    margin: 0 auto;
    flex: 1;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
}

.panel-heading-title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
    text-wrap: balance;
}

.layout-overview,
.layout-panel {
    border-radius: $radius-lg;
}

.layout-overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    min-height: 7.5rem;
    padding: 1px;
    overflow: hidden;
}

.placeholder-cluster {
    display: grid;
    align-content: center;
    gap: $space-3;
    padding: $space-5;
    background: rgb(7 4 11 / 18%);
    border-inline-end: 1px solid rgb(221 199 255 / 9%);
}

.placeholder-cluster:last-child {
    border-inline-end: 0;
}

.layout-panels {
    // display: grid;
    // grid-template-columns: minmax(0, 1fr);
    display: flex;
    flex: 1;
    // flex-direction: column;
    gap: $space-4;
    min-width: 0;
}

.layout-panel {
    display: none;
    grid-template-rows: auto minmax(0, 1fr);
    gap: $space-4;
    min-height: 24rem;
    padding: $space-5 $space-5 0;
    flex: 1 0 0;
}

.layout-panel.is-active {
    display: flex;
    flex-direction: column;
}

.layout-viewer {
    align-content: start;
    grid-template-rows: auto 1fr;
}

.panel-heading {
    display: flex;
    gap: $space-4;
    align-items: end;
    justify-content: space-between;
}

.panel-title {
    display: grid;
    gap: $space-1;
}

.back-button {
    width: fit-content;
    padding: 0;
    color: $color-ink-muted;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;
}

.back-button:hover,
.back-button:focus-visible {
    color: $color-signal-light;
}

.viewer-back-button {
    justify-self: start;
}

.item-count {
    flex: 0 0 auto;
    padding: $space-1 $space-3;
    color: $color-ink-secondary;
    font-size: 0.75rem;
    background: rgb(245 241 251 / 6%);
    border: 1px solid rgb(245 241 251 / 10%);
    border-radius: $radius-full;
}

.card-list {
    flex: 1 0 0;
    display: flex;
    flex-direction: column;
    gap: $space-3;
    margin: 0;
    padding: 0 0 1.5rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
}

.card-list li {
    min-width: 0;
}

.list-message {
    align-self: start;
    color: $color-ink-muted;
}

.placeholder-line {
    display: block;
    height: 0.5rem;
    background: rgb(245 241 251 / 8%);
    border: 1px solid rgb(245 241 251 / 5%);
    border-radius: $radius-full;
}

.placeholder-line-short {
    width: 34%;
}

.placeholder-line-medium {
    width: 58%;
}

.placeholder-line-long {
    width: 82%;
}

@include bp-md-tablet {
    .layout-panels {
        grid-template-columns: minmax(18rem, 0.8fr) minmax(0, 1.4fr);
    }

    .layout-panel {
        min-height: 38rem;
    }

    .layout-panel.is-adjacent {
        display: flex;
        flex-direction: column;
    }

    .viewer-back-button {
        display: none;
    }
}

@include bp-max('sm') {
    .layout-overview {
        grid-template-columns: 1fr;
    }

    .placeholder-cluster {
        min-height: 6rem;
        border-inline-end: 0;
        border-block-end: 1px solid rgb(221 199 255 / 9%);
    }

    .placeholder-cluster:last-child {
        border-block-end: 0;
    }
}

@media (forced-colors: active) {
    .placeholder-line {
        border: 1px solid ButtonText;
    }
}
</style>
