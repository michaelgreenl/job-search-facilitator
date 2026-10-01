import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import AgentStream from '@/components/agent/AgentStream.vue'
import { useAgentStore } from '@/stores/agent'
import { makeAgentTask, makeAgentTaskState } from '@/test/fixtures/agent'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

afterEach(async () => {
    await page.viewport(1024, 768)
})

it('expands progress history on mobile without clipping', async () => {
    await page.viewport(320, 600)
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useAgentStore()
    const task = makeAgentTask()
    const createdAt = new Date().toISOString()
    const heading = 'Checking application details'
    store.taskStates[task.id] = makeAgentTaskState(task, {
        events: [
            { type: 'activity', message: 'Using Chrome', createdAt },
            {
                type: 'message',
                textDelta: 'Reviewing job requirements',
                startsNewStatement: true,
                createdAt,
            },
        ],
    })
    mountVue(AgentStream, {
        props: { taskId: task.id, issue: null },
        install: (app) => app.use(pinia),
        style: { display: 'flex', flexDirection: 'column', height: '400px', width: '280px' },
    })
    const latest = page.getByTestId('agent-reasoning-latest')
    await expect.element(latest).toBeVisible()
    expect(page.getByTestId('agent-reasoning-toggle').elements()).toHaveLength(0)

    const state = store.taskStates[task.id]!
    store.taskStates = {
        [task.id]: {
            ...state,
            events: [
                ...state.events,
                { type: 'activity', message: 'Using Chrome', createdAt },
                {
                    type: 'message',
                    textDelta: heading,
                    startsNewStatement: true,
                    createdAt,
                },
            ],
        },
    }
    await nextTick()
    const toggle = page.getByTestId('agent-reasoning-toggle')
    const trace = page.getByTestId('agent-reasoning-trace')
    expect((latest.element() as HTMLElement).innerText).toBe(heading)
    await expect.element(trace).not.toBeVisible()
    await userEvent.keyboard('{Tab}')
    await expect.element(toggle).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(trace).toBeVisible()
    expect((trace.element() as HTMLElement).innerText).toBe('Reviewing job requirements')
    expect(page.getByTestId('agent-stream-activity').elements()).toHaveLength(1)

    const expandedState = store.taskStates[task.id]!
    store.taskStates = {
        [task.id]: {
            ...expandedState,
            events: [
                ...expandedState.events,
                {
                    type: 'message',
                    textDelta: heading,
                    startsNewStatement: true,
                    createdAt,
                },
            ],
        },
    }
    await nextTick()
    expect((latest.element() as HTMLElement).innerText).toBe(heading)
    await expect.element(trace).toBeVisible()
    await expect.element(page.getByTestId('agent-progress-indicator')).toBeVisible()

    const progress = page.getByTestId('agent-progress').element()
    expect(progress.scrollWidth).toBeLessThanOrEqual(progress.clientWidth)
    for (const text of [latest, trace]) {
        const range = document.createRange()
        range.selectNodeContents(text.element())
        const bounds = text.element().getBoundingClientRect()
        expect(
            Array.from(range.getClientRects()).every(
                (line) => line.right <= bounds.right + 1 && line.bottom <= bounds.bottom + 1,
            ),
        ).toBe(true)
    }
    await toggle.click()
    await expect.element(trace).not.toBeVisible()
    await expect.element(latest).toBeVisible()
})
