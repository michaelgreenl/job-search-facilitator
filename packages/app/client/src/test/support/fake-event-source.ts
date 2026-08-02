import { vi } from 'vitest'

export class FakeEventSource {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    static instances: FakeEventSource[] = []

    readyState: number = FakeEventSource.CONNECTING
    onopen: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    readonly close = vi.fn(() => {
        this.readyState = FakeEventSource.CLOSED
    })

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this)
    }

    static reset() {
        FakeEventSource.instances = []
    }

    static forTask(taskId: string) {
        return FakeEventSource.instances.find(({ url }) =>
            url.endsWith(`/tasks/${encodeURIComponent(taskId)}/events`),
        )
    }

    open() {
        this.readyState = FakeEventSource.OPEN
        this.onopen?.()
    }

    message(value: unknown) {
        this.onmessage?.({ data: JSON.stringify(value) })
    }

    disconnect(readyState = FakeEventSource.CONNECTING) {
        this.readyState = readyState
        this.onerror?.()
    }

    fail() {
        this.disconnect(FakeEventSource.CLOSED)
    }
}
