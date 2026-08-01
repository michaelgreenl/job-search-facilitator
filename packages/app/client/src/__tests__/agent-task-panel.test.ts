/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import AgentTaskPanel from '@/components/agent/AgentTaskPanel.vue'
import { mountVue } from '@/test/support/mount'

const mountPanel = (overrides: Partial<InstanceType<typeof AgentTaskPanel>['$props']> = {}) => {
    const onBack = vi.fn()
    const onCancel = vi.fn()
    const onRetry = vi.fn()
    const mounted = mountVue(AgentTaskPanel, {
        props: {
            active: true,
            adjacent: false,
            lane: 'job-post-import',
            eyebrow: 'Agent task',
            backLabel: 'Back',
            backTestId: 'agent-task-back',
            cancelling: false,
            running: false,
            issue: null,
            cancelLabel: 'Cancel',
            cancelTestId: 'agent-task-cancel',
            retryTestId: 'agent-task-retry',
            onBack,
            onCancel,
            onRetry,
            ...overrides,
        },
        install: (app) => app.use(createPinia()),
    })

    return { ...mounted, onBack, onCancel, onRetry }
}

describe('AgentTaskPanel', () => {
    it('keeps back available while a running task can be cancelled', () => {
        const { root, onBack, onCancel } = mountPanel({ running: true })
        const back = root.querySelector<HTMLButtonElement>('[data-testid="agent-task-back"]')
        const cancel = root.querySelector<HTMLButtonElement>('[data-testid="agent-task-cancel"]')

        expect(back).not.toBeNull()
        expect(cancel?.disabled).toBe(false)
        expect(root.querySelector('[data-testid="agent-task-retry"]')).toBeNull()

        back?.click()
        cancel?.click()

        expect(onBack).toHaveBeenCalledOnce()
        expect(onCancel).toHaveBeenCalledOnce()
    })

    it('blocks another cancellation while cancellation is pending', () => {
        const { root, onCancel } = mountPanel({ cancelling: true, running: true })
        const cancel = root.querySelector<HTMLButtonElement>('[data-testid="agent-task-cancel"]')

        expect(cancel?.disabled).toBe(true)

        cancel?.click()

        expect(onCancel).not.toHaveBeenCalled()
    })

    it('keeps back available when a terminal task can be retried', () => {
        const { root, onBack, onRetry } = mountPanel({ retryAvailable: true })
        const back = root.querySelector<HTMLButtonElement>('[data-testid="agent-task-back"]')
        const retry = root.querySelector<HTMLButtonElement>('[data-testid="agent-task-retry"]')

        expect(back).not.toBeNull()
        expect(retry).not.toBeNull()
        expect(root.querySelector('[data-testid="agent-task-cancel"]')).toBeNull()

        back?.click()
        retry?.click()

        expect(onBack).toHaveBeenCalledOnce()
        expect(onRetry).toHaveBeenCalledOnce()
    })

    it('keeps back available when a terminal task has no action', () => {
        const { root, onBack } = mountPanel()
        const back = root.querySelector<HTMLButtonElement>('[data-testid="agent-task-back"]')

        expect(back).not.toBeNull()
        expect(root.querySelector('[data-testid="agent-task-cancel"]')).toBeNull()
        expect(root.querySelector('[data-testid="agent-task-retry"]')).toBeNull()

        back?.click()

        expect(onBack).toHaveBeenCalledOnce()
    })
})
