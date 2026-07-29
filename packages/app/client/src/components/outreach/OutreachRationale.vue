<script setup lang="ts">
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    useId,
    useTemplateRef,
    watch,
} from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

const OVERFLOW_TOLERANCE_PX = 1

const props = withDefaults(
    defineProps<{
        expanded?: boolean
        rationale: string
    }>(),
    {
        expanded: false,
    },
)

const descriptionExpanded = shallowRef(false)
const rationaleExpanded = computed(() => props.expanded || descriptionExpanded.value)
const rationaleId = useId()
const rationaleElement = useTemplateRef<HTMLElement>('rationale')
const rationaleOverflowing = shallowRef(false)
const showRationaleToggle = computed(() => !props.expanded && rationaleOverflowing.value)
let rationaleResizeObserver: ResizeObserver | null = null

function updateRationaleOverflow() {
    const element = rationaleElement.value

    if (element === null) {
        rationaleOverflowing.value = false
        return
    }

    if (rationaleExpanded.value) {
        return
    }

    rationaleOverflowing.value = element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE_PX
}

async function updateRationaleOverflowAfterRender() {
    await nextTick()
    updateRationaleOverflow()
}

function toggleRationale() {
    descriptionExpanded.value = !descriptionExpanded.value

    if (!descriptionExpanded.value) {
        void updateRationaleOverflowAfterRender()
    }
}

watch([() => props.rationale, () => props.expanded], () => {
    descriptionExpanded.value = false
    rationaleOverflowing.value = false
    void updateRationaleOverflowAfterRender()
})

watch(
    rationaleElement,
    (element) => {
        rationaleResizeObserver?.disconnect()
        rationaleResizeObserver = null
        rationaleOverflowing.value = false

        if (typeof ResizeObserver !== 'undefined' && element !== null) {
            rationaleResizeObserver = new ResizeObserver(updateRationaleOverflow)
            rationaleResizeObserver.observe(element)
        }

        void updateRationaleOverflowAfterRender()
    },
    { flush: 'post' },
)

onMounted(() => {
    if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', updateRationaleOverflow)
    }
})

onBeforeUnmount(() => {
    rationaleResizeObserver?.disconnect()
    window.removeEventListener('resize', updateRationaleOverflow)
})
</script>

<template>
    <div class="copy">
        <p
            :id="rationaleId"
            ref="rationale"
            class="text"
            data-testid="outreach-contact-rationale"
            :class="{ 'is-clamped': !rationaleExpanded }"
        >
            {{ rationale }}
        </p>
        <div v-if="showRationaleToggle" class="actions">
            <BaseButton
                class="toggle"
                preset="text"
                data-testid="outreach-contact-rationale-toggle"
                :aria-controls="rationaleId"
                :aria-expanded="descriptionExpanded"
                @click="toggleRationale"
            >
                {{ descriptionExpanded ? 'Show less' : 'Show more' }}
            </BaseButton>
        </div>
    </div>
</template>

<style scoped lang="scss">
.copy {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.text {
    margin: 0;
    color: $color-ink-secondary;
    font-size: 0.875rem;

    &.is-clamped {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
    }
}

.actions {
    position: relative;
    z-index: 2;
    display: flex;
    gap: $space-2;
    align-items: center;
    min-width: 0;
    margin-top: $space-2;
}

.toggle {
    position: relative;
    z-index: 2;
    padding: 0 $space-1 0 0;
    margin-left: auto;
    font-size: 0.875rem;
}
</style>
