<template>
    <section class="filters glass-surface" aria-labelledby="filters-title">
        <div class="filter-bar-head">
            <div class="section-heading">
                <h2 id="filters-title">Filter targets</h2>
                <strong role="status">20 of 72 in view</strong>
            </div>

            <div class="filter-actions">
                <button class="button button--ghost mobile-filter-toggle" type="button">
                    Filters
                </button>
                <button class="button button--ghost" type="reset">Reset filters</button>
            </div>
        </div>

        <form class="filter-grid">
            <label class="search-field-wrap">
                <span class="control-label">Search</span>
                <span class="search-field">
                    <span class="search-field-icon" aria-hidden="true"></span>
                    <input type="search" placeholder="Role, company, location…" />
                    <kbd aria-hidden="true">/</kbd>
                </span>
            </label>

            <label class="select-field">
                <span class="control-label">Run</span>
                <span class="select-control">
                    <select>
                        <option>All</option>
                        <option selected>2026-07-03</option>
                        <option>2026-07-02</option>
                    </select>
                </span>
            </label>

            <label class="select-field">
                <span class="control-label">Label</span>
                <span class="select-control">
                    <select>
                        <option>All</option>
                        <option selected>Unreviewed</option>
                        <option>P1</option>
                        <option>P2</option>
                        <option>Fast apply</option>
                        <option>Archived</option>
                    </select>
                </span>
            </label>

            <label class="select-field">
                <span class="control-label">Agent verdict</span>
                <span class="select-control">
                    <select>
                        <option selected>All</option>
                        <option>Targeted</option>
                        <option>Fast apply</option>
                    </select>
                </span>
            </label>

            <label class="select-field">
                <span class="control-label">Resume</span>
                <span class="select-control">
                    <select>
                        <option selected>All</option>
                        <option>Frontend</option>
                        <option>Backend / full-stack</option>
                        <option>General</option>
                    </select>
                </span>
            </label>
        </form>
    </section>
</template>
