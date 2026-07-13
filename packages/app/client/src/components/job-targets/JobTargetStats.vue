<template>
    <section class="stats glass-surface" aria-label="Run briefing">
        <div class="metric metric--lead">
            <span class="metric-index" aria-hidden="true">01</span>
            <span class="metric-label">Review queue</span>
            <strong class="metric-value">13</strong>
            <small class="metric-detail">7 reviewed of 20</small>
            <span
                class="queue-progress"
                role="progressbar"
                aria-label="35% of targets reviewed"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="35"
            >
                <span class="queue-progress-value"></span>
            </span>
        </div>

        <div class="metric">
            <span class="metric-index" aria-hidden="true">02</span>
            <span class="metric-label">P1 shortlist</span>
            <strong class="metric-value">3</strong>
        </div>

        <div class="metric">
            <span class="metric-index" aria-hidden="true">03</span>
            <span class="metric-label">P2 shortlist</span>
            <strong class="metric-value">5</strong>
        </div>

        <div class="metric">
            <span class="metric-index" aria-hidden="true">04</span>
            <span class="metric-label">Fast apply</span>
            <strong class="metric-value">2</strong>
        </div>

        <div class="metric">
            <span class="metric-index" aria-hidden="true">05</span>
            <span class="metric-label">Reports</span>
            <strong class="metric-value">10</strong>
        </div>

        <div class="metric">
            <span class="metric-index" aria-hidden="true">06</span>
            <span class="metric-label">Archived</span>
            <strong class="metric-value">8</strong>
        </div>
    </section>
</template>
