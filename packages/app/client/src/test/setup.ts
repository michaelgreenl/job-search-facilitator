import { afterEach, vi } from 'vitest'
import { cleanupVueMounts } from './support/mount'

afterEach(() => {
    cleanupVueMounts()
    globalThis.sessionStorage?.clear?.()
    globalThis.localStorage?.clear?.()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})
