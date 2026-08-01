import { vi } from 'vitest'

type MediaQueryListener = (event: MediaQueryListEvent) => void

const queryMatchesWidth = (query: string, width: number) => {
    const minimum = query.match(/min-width:\s*(\d+)px/)
    const maximum = query.match(/max-width:\s*(\d+)px/)

    return (
        (minimum === null || width >= Number(minimum[1])) &&
        (maximum === null || width <= Number(maximum[1]))
    )
}

class ControlledMediaQueryList implements MediaQueryList {
    onchange: MediaQueryListener | null = null
    readonly listeners = new Set<MediaQueryListener>()

    constructor(
        readonly media: string,
        private width: number,
    ) {}

    get matches() {
        return queryMatchesWidth(this.media, this.width)
    }

    setWidth(width: number) {
        const matched = this.matches
        this.width = width

        if (matched === this.matches) {
            return
        }

        const event = new Event('change') as MediaQueryListEvent
        Object.defineProperties(event, {
            matches: { value: this.matches },
            media: { value: this.media },
        })
        this.onchange?.(event)

        for (const listener of this.listeners) {
            listener(event)
        }
    }

    addEventListener(type: 'change', listener: EventListenerOrEventListenerObject | null): void {
        if (type === 'change' && typeof listener === 'function') {
            this.listeners.add(listener as MediaQueryListener)
        }
    }

    removeEventListener(type: 'change', listener: EventListenerOrEventListenerObject | null): void {
        if (type === 'change' && typeof listener === 'function') {
            this.listeners.delete(listener as MediaQueryListener)
        }
    }

    addListener(listener: MediaQueryListener | null) {
        if (listener !== null) {
            this.listeners.add(listener)
        }
    }

    removeListener(listener: MediaQueryListener | null) {
        if (listener !== null) {
            this.listeners.delete(listener)
        }
    }

    dispatchEvent(event: Event) {
        if (event.type !== 'change') {
            return true
        }

        this.onchange?.(event as MediaQueryListEvent)
        for (const listener of this.listeners) {
            listener(event as MediaQueryListEvent)
        }
        return !event.defaultPrevented
    }
}

export function installMatchMedia(initialWidth: number) {
    let width = initialWidth
    const queries = new Map<string, ControlledMediaQueryList>()
    const matchMedia = (query: string) => {
        const existing = queries.get(query)

        if (existing !== undefined) {
            return existing
        }

        const mediaQuery = new ControlledMediaQueryList(query, width)
        queries.set(query, mediaQuery)
        return mediaQuery
    }

    vi.stubGlobal('matchMedia', matchMedia)

    return {
        setWidth(nextWidth: number) {
            width = nextWidth
            for (const query of queries.values()) {
                query.setWidth(width)
            }
        },
    }
}
