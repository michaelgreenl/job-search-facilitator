<script setup lang="ts">
import { onMounted } from 'vue'
import { usePostStore } from '@/stores/post.store'
import { useReportStore } from '@/stores/report.store'
import SearchReportCard from '@/components/search-report/SearchReportCard.vue'

const postStore = usePostStore()
const reportStore = useReportStore()

onMounted(async () => {
    await Promise.allSettled([reportStore.fetchReports(), postStore.fetchPosts()])
    console.log(reportStore.reports)
})
</script>

<template>
    <section class="layout-draft" aria-labelledby="layout-title">
        <!-- TODO: search-report statistics while the search-report list is active (e.g. "Last Run", "Report Count", keep it simple) -->
        <section class="layout-overview glass-frame" aria-label="Overview frame">
            <div class="placeholder-cluster" aria-hidden="true">
                <span class="placeholder-line placeholder-line-short"></span>
                <span class="placeholder-line placeholder-line-long"></span>
            </div>
            <div class="placeholder-cluster" aria-hidden="true">
                <span class="placeholder-line placeholder-line-short"></span>
                <span class="placeholder-line placeholder-line-medium"></span>
            </div>
            <div class="placeholder-cluster" aria-hidden="true">
                <span class="placeholder-line placeholder-line-short"></span>
                <span class="placeholder-line placeholder-line-long"></span>
            </div>
        </section>

        <div class="layout-panels">
            <section class="layout-primary glass-frame" aria-label="Primary workspace frame">
                <!-- TODO: header for the search-report card list or job-post card list -->
                <div class="placeholder-heading" aria-hidden="true">
                    <span class="placeholder-line placeholder-line-medium"></span>
                    <span class="placeholder-chip"></span>
                </div>

                <div class="placeholder-rows" aria-hidden="true">
                    <!-- TODO: see todo comment in component -->
                    <SearchReportCard
                        v-for="report in reportStore.reports"
                        :key="report.reportDate"
                        :report="report"
                    />
                </div>

                <div class="placeholder-rows" aria-hidden="true">
                    <!-- TODO: see todo comment in component -->
                    <SearchReportCard
                        v-for="report in reportStore.reports"
                        :key="report.reportDate"
                        :report="report"
                    />
                </div>
            </section>

            <!-- TODO: move to job-post-viewer -->
            <aside class="layout-secondary glass-frame" aria-label="Secondary workspace frame">
                <div class="placeholder-feature" aria-hidden="true"></div>
                <span class="placeholder-line placeholder-line-long" aria-hidden="true"></span>
                <span class="placeholder-line placeholder-line-medium" aria-hidden="true"></span>
                <span class="placeholder-line placeholder-line-short" aria-hidden="true"></span>
            </aside>
        </div>
    </section>
</template>

<style scoped lang="scss">
.layout-draft {
    gap: $space-4;
    width: 100%;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
}

.dashboard-heading h1 {
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
}

.layout-overview,
.layout-primary,
.layout-secondary {
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
    gap: $space-4;
    min-width: 0;
}

.layout-primary,
.layout-secondary {
    min-height: 29rem;
    padding: $space-5;
}

.layout-primary {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: $space-6;
}

.layout-secondary {
    // display: grid;
    // align-content: start;
    // gap: $space-3;
}

.placeholder-line,
.placeholder-chip,
.placeholder-rows > span,
.placeholder-feature {
    display: block;
    background: rgb(245 241 251 / 8%);
    border: 1px solid rgb(245 241 251 / 5%);
}

.placeholder-line {
    height: 0.5rem;
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

.placeholder-heading {
    display: flex;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
}

.placeholder-chip {
    width: 3.5rem;
    height: 1.375rem;
    flex: 0 0 auto;
    border-radius: $radius-full;
}

.placeholder-rows {
    display: grid;
    gap: $space-3;
}

.placeholder-rows > span {
    min-height: 4.75rem;
    border-radius: $radius-md;
}

.placeholder-rows > span:first-child {
    background: rgb(173 123 249 / 8%);
    border-color: rgb(173 123 249 / 17%);
}

.placeholder-feature {
    aspect-ratio: 1.65;
    margin-block-end: $space-3;
    background: linear-gradient(145deg, rgb(255 255 255 / 7%), rgb(173 123 249 / 7%));
    border-radius: $radius-md;
}

@media (width <= 53rem) {
    .layout-panels {
        grid-template-columns: 1fr;
    }

    .layout-primary,
    .layout-secondary {
        min-height: 24rem;
    }

    .layout-secondary {
        min-height: 20rem;
    }
}

@media (width <= 42rem) {
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
    .placeholder-line,
    .placeholder-chip,
    .placeholder-rows > span,
    .placeholder-feature {
        border: 1px solid ButtonText;
    }
}
</style>
