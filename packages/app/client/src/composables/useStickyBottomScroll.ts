import { nextTick, onBeforeUnmount, onMounted, readonly, shallowRef, watch } from 'vue'
import type { ShallowRef, WatchSource } from 'vue'

const BOTTOM_TOLERANCE = 4
const SCROLL_WRITE_TOLERANCE = 0.5

export function useStickyBottomScroll(
    container: Readonly<ShallowRef<HTMLElement | null>>,
    content: WatchSource<unknown>,
) {
    const followingLatest = shallowRef(true)
    let resizeObserver: ResizeObserver | null = null

    function scrollToBottom() {
        const element = container.value

        if (element === null) {
            return
        }

        const bottom = Math.max(0, element.scrollHeight - element.clientHeight)

        if (Math.abs(element.scrollTop - bottom) <= SCROLL_WRITE_TOLERANCE) {
            return
        }

        element.scrollTop = bottom
    }

    async function followLatestAfterRender() {
        if (!followingLatest.value) {
            return
        }

        await nextTick()

        if (followingLatest.value) {
            scrollToBottom()
        }
    }

    function handleScroll() {
        const element = container.value

        if (element === null) {
            return
        }

        const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop
        followingLatest.value = distanceFromBottom <= BOTTOM_TOLERANCE
    }

    function resetFollowing() {
        followingLatest.value = true
        void followLatestAfterRender()
    }

    watch(
        content,
        () => {
            void followLatestAfterRender()
        },
        { flush: 'post' },
    )
    onMounted(() => {
        if (typeof ResizeObserver !== 'undefined' && container.value !== null) {
            resizeObserver = new ResizeObserver(() => {
                void followLatestAfterRender()
            })
            resizeObserver.observe(container.value)
        }

        void followLatestAfterRender()
    })
    onBeforeUnmount(() => resizeObserver?.disconnect())

    return { followingLatest: readonly(followingLatest), handleScroll, resetFollowing }
}
