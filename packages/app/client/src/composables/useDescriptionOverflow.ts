import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    toValue,
    useId,
    watch,
    type MaybeRefOrGetter,
} from 'vue'

const OVERFLOW_TOLERANCE_PX = 1

export function useDescriptionOverflow(
    description: MaybeRefOrGetter<string>,
    forceExpanded: MaybeRefOrGetter<boolean> = false,
) {
    const descriptionElement = shallowRef<HTMLElement | null>(null)
    const descriptionId = useId()
    const userExpanded = shallowRef(false)
    const overflowing = shallowRef(false)
    const expanded = computed(() => toValue(forceExpanded) || userExpanded.value)
    const showToggle = computed(() => !toValue(forceExpanded) && overflowing.value)
    let resizeObserver: ResizeObserver | null = null

    function updateOverflow() {
        const element = descriptionElement.value

        if (element === null) {
            overflowing.value = false
            return
        }

        if (!expanded.value) {
            overflowing.value = element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE_PX
        }
    }

    async function updateOverflowAfterRender() {
        await nextTick()
        updateOverflow()
    }

    function toggleExpanded() {
        userExpanded.value = !userExpanded.value

        if (!userExpanded.value) {
            void updateOverflowAfterRender()
        }
    }

    watch([() => toValue(description), () => toValue(forceExpanded)], () => {
        userExpanded.value = false
        overflowing.value = false
        void updateOverflowAfterRender()
    })

    watch(
        descriptionElement,
        (element) => {
            resizeObserver?.disconnect()
            resizeObserver = null
            overflowing.value = false

            if (typeof ResizeObserver !== 'undefined' && element !== null) {
                resizeObserver = new ResizeObserver(updateOverflow)
                resizeObserver.observe(element)
            }

            void updateOverflowAfterRender()
        },
        { flush: 'post' },
    )

    onMounted(() => {
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateOverflow)
        }
    })

    onBeforeUnmount(() => {
        resizeObserver?.disconnect()
        window.removeEventListener('resize', updateOverflow)
    })

    return {
        descriptionElement,
        descriptionId,
        expanded,
        showToggle,
        toggleExpanded,
        userExpanded,
    }
}
