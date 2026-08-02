<template>
    <span class="loading-spinner" aria-hidden="true"></span>
</template>

<style scoped lang="scss">
.loading-spinner {
    display: inline-block;
    flex: none;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid currentcolor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
}

@keyframes loading-spin {
    to {
        transform: rotate(1turn);
    }
}
</style>
