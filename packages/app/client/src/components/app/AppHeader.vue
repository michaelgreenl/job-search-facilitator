<template>
    <header class="app-header glass-frame">
        <a class="brand" href="/" aria-label="Job Search Facilitator home">
            <span class="brand-mark" aria-hidden="true">JF</span>
            <span class="brand-copy">
                <strong>Job Search Facilitator</strong>
                <small>Local-first workspace</small>
            </span>
        </a>

        <span class="header-signal" aria-hidden="true"></span>
    </header>
</template>

<style scoped lang="scss">
.app-header {
    position: sticky;
    inset-block-start: $space-4;
    z-index: 10;
    display: flex;
    width: min(100%, 76rem);
    min-height: 4.5rem;
    align-items: center;
    justify-content: space-between;
    margin-inline: auto;
    padding: $space-3 $space-4;
    border-radius: $radius-xl;
}

.brand {
    display: inline-flex;
    gap: $space-3;
    align-items: center;
    min-width: 0;
    text-decoration: none;
}

.brand-mark {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    flex: 0 0 auto;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    place-items: center;
    background: rgb(173 123 249 / 12%);
    border: 1px solid rgb(173 123 249 / 34%);
    border-radius: $radius-md;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 14%);
}

.brand-copy {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
}

.brand-copy strong {
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.brand-copy small {
    color: $color-ink-muted;
    font-size: 0.6875rem;
}

.header-signal {
    width: 0.5rem;
    height: 0.5rem;
    flex: 0 0 auto;
    background: $color-signal;
    border-radius: $radius-full;
    box-shadow:
        0 0 0 5px rgb(173 123 249 / 10%),
        0 0 24px rgb(173 123 249 / 42%);
}

@media (width <= 42rem) {
    .app-header {
        inset-block-start: $space-3;
    }
}

@media (width <= 30rem) {
    .brand-copy small {
        display: none;
    }
}

@media (prefers-contrast: more) {
    .brand-copy small {
        color: $color-ink;
    }
}

@media (forced-colors: active) {
    .brand-mark {
        border: 1px solid ButtonText;
    }
}
</style>
