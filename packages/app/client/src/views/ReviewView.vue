<script setup lang="ts">
import type { JobSearchReport, JobSearchResult, UserLabel } from '@job-search-facilitator/core'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useReportStore } from '@/stores/report.store'
import { usePostStore } from '@/stores/post.store'
import JobPostCard from '@/components/job-post/JobPostCard.vue'
import JobPostViewer from '@/components/job-post/JobPostViewer.vue'
import SearchReportCard from '@/components/search-report/SearchReportCard.vue'

type ActivePanel = 'reports' | 'posts' | 'viewer'
type PostFilter = 'all' | 'labeled' | 'unreviewed' | 'forgone'

const reportStore = useReportStore()
const postStore = usePostStore()
const activePanel = shallowRef<ActivePanel>('reports')
const postFilter = shallowRef<PostFilter>('all')
const selectedReport = shallowRef<JobSearchReport | null>(null)
const selectedResult = shallowRef<JobSearchResult | null>(null)
const labelUpdating = shallowRef(false)
const labelError = shallowRef<string | null>(null)

const filteredResults = computed(() => {
    const results = selectedReport.value?.results ?? []

    if (postFilter.value === 'labeled') {
        return results.filter(({ post }) => post.userLabel !== null && post.userLabel !== 'forgo')
    }

    if (postFilter.value === 'unreviewed') {
        return results.filter(({ post }) => post.userLabel === null)
    }

    if (postFilter.value === 'forgone') {
        return results.filter(({ post }) => post.userLabel === 'forgo')
    }

    return results
})

watch(filteredResults, (results) => {
    const selectedPostId = selectedResult.value?.post.id

    if (selectedPostId !== undefined && results.some(({ post }) => post.id === selectedPostId)) {
        return
    }

    selectedResult.value = results[0] ?? null

    if (selectedResult.value === null && activePanel.value === 'viewer') {
        activePanel.value = 'posts'
    }
})

function selectReport(report: JobSearchReport) {
    selectedReport.value = report
    postFilter.value = 'all'
    selectedResult.value = report.results[0] ?? null
    labelError.value = null
    activePanel.value = 'posts'
}

function selectResult(result: JobSearchResult) {
    selectedResult.value = result
    labelError.value = null
    activePanel.value = 'viewer'
}

function showReports() {
    activePanel.value = 'reports'
}

function showPosts() {
    activePanel.value = 'posts'
}

async function updateUserLabel(userLabel: UserLabel | null) {
    const postId = selectedResult.value?.post.id

    if (postId === undefined || labelUpdating.value) {
        return
    }

    labelUpdating.value = true
    labelError.value = null

    try {
        await postStore.updatePost(postId, { userLabel })
    } catch (error) {
        labelError.value = error instanceof Error ? error.message : 'Could not update label'
    } finally {
        labelUpdating.value = false
    }
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

                    <div class="panel-controls">
                        <span class="item-count">{{ filteredResults.length }} posts</span>
                        <label class="post-filter">
                            <span>Filter</span>
                            <select
                                v-model="postFilter"
                                class="post-filter-select"
                                :disabled="selectedReport === null"
                            >
                                <option value="all">All</option>
                                <option value="labeled">Labeled</option>
                                <option value="unreviewed">Unreviewed</option>
                                <option value="forgone">Forgone</option>
                            </select>
                        </label>
                    </div>
                </header>

                <ul v-if="filteredResults.length" class="card-list">
                    <li v-for="result in filteredResults" :key="result.post.id">
                        <JobPostCard
                            :result="result"
                            :selected="selectedResult?.post.id === result.post.id"
                            @select="selectResult(result)"
                        />
                    </li>
                </ul>
                <p v-else class="list-message">
                    {{
                        selectedReport?.results.length
                            ? 'No job posts match this filter.'
                            : selectedReport
                              ? 'This report has no job posts.'
                              : 'Select a search report.'
                    }}
                </p>
            </section>

            <aside
                v-if="selectedResult"
                class="job-post-view layout-panel glass-frame"
                :class="{
                    'is-active': activePanel === 'viewer',
                    'is-adjacent': activePanel === 'posts',
                }"
            >
                <button
                    class="back-button back-button-viewer"
                    type="button"
                    aria-label="Back to job posts"
                    @click="showPosts"
                >
                    ←
                </button>
                <JobPostViewer
                    :result="selectedResult"
                    :label-updating="labelUpdating"
                    :label-error="labelError"
                    @update-label="updateUserLabel"
                />
            </aside>
        </div>
    </section>
</template>

<style scoped lang="scss">
.layout-draft {
    display: flex;
    flex-direction: column;
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

.layout-panels {
    display: flex;
    flex: 1;
    gap: $space-4;
    min-width: 0;
}

.layout-panel {
    display: none;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 24rem;
    padding: $space-5 $space-5 0;
    border-radius: $radius-lg;

    &.is-active {
        display: flex;
    }

    @include bp-md-tablet {
        min-height: 38rem;

        &.is-adjacent {
            display: flex;
            min-width: 20rem;
        }
    }

    &.job-post-view {
        flex: 2;
    }
}

.panel-heading {
    display: flex;
    flex-wrap: wrap;
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

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }

    &-viewer {
        @include bp-md-tablet {
            display: none;
        }
    }
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

.panel-controls {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    align-items: center;
    justify-content: flex-end;
}

.post-filter {
    display: flex;
    gap: $space-2;
    align-items: center;
    color: $color-ink-muted;
    font-size: 0.75rem;

    &-select {
        padding: $space-1 $space-2;
        color: $color-ink;
        font: inherit;
        background: $color-night;
        border: 1px solid rgb(245 241 251 / 16%);
        border-radius: $radius-sm;

        &:disabled {
            opacity: 0.5;
        }
    }
}

.card-list {
    display: flex;
    flex: 1 0 0;
    flex-direction: column;
    gap: $space-3;
    margin: 0;
    padding: 0 0 $space-5;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
}

.card-list li {
    min-width: 0;
}

.list-message {
    color: $color-ink-muted;
}
</style>
