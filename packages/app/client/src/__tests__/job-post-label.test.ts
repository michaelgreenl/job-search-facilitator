/** @vitest-environment jsdom */

import type { ApplicationStatus, UserLabel } from '@job-search-facilitator/core'
import { createApp } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import JobPostLabel from '@/components/job-posts/JobPostLabel.vue'

const mountedApps: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

function mountLabel(applicationStatus: ApplicationStatus, userLabel: UserLabel) {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(JobPostLabel, { applicationStatus, userLabel })
    app.mount(root)
    mountedApps.push({ app, root })

    return root.querySelector('.user-label')
}

describe('JobPostLabel', () => {
    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }
    })

    it.each([
        ['P1', 'priority-high'],
        ['P2', 'priority-medium'],
        ['quick-app', 'quick'],
        ['forgo', 'muted'],
    ] as const)('uses the dropdown tone for the %s badge', (userLabel, tone) => {
        const label = mountLabel('not-applied', userLabel)

        expect(label?.classList.contains(`user-label-${tone}`)).toBe(true)
    })

    it('uses the applied dropdown tone instead of the user label tone', () => {
        const label = mountLabel('awaiting-response', 'P1')

        expect(label?.textContent?.trim()).toBe('applied')
        expect(label?.classList.contains('user-label-success')).toBe(true)
        expect(label?.classList.contains('user-label-priority-high')).toBe(false)
    })
})
