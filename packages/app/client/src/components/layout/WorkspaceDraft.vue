<template>
    <section class="layout-draft" aria-labelledby="layout-title">
        <header class="dashboard-heading">
            <div>
                <p class="eyebrow">Local workspace</p>
                <h1 id="layout-title">Dashboard</h1>
            </div>
        </header>

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
                <div class="placeholder-heading" aria-hidden="true">
                    <span class="placeholder-line placeholder-line-medium"></span>
                    <span class="placeholder-chip"></span>
                </div>

                <div class="placeholder-rows" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </section>

            <aside class="layout-secondary glass-frame" aria-label="Secondary workspace frame">
                <div class="placeholder-feature" aria-hidden="true"></div>
                <span class="placeholder-line placeholder-line-long" aria-hidden="true"></span>
                <span class="placeholder-line placeholder-line-medium" aria-hidden="true"></span>
                <span class="placeholder-line placeholder-line-short" aria-hidden="true"></span>
            </aside>
        </div>
    </section>
</template>
