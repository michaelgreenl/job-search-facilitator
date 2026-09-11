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

it('expands a long streaming update by keyboard without clipping text in a narrow panel', async () => {
    await page.viewport(320, 600)
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useAgentStore()
    const task = makeAgentTask()
    const createdAt = new Date().toISOString()
    const text = `Checking the requirements and the application details at https://example.com/${'role'.repeat(50)}`
    store.taskStates[task.id] = makeAgentTaskState(task, {
        events: [
            {
                type: 'message',
                textDelta: text,
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

    const toggle = page.getByTestId('agent-reasoning-toggle')
    const trace = page.getByTestId('agent-reasoning-trace')
    await expect.element(trace).not.toBeVisible()
    toggle.element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(trace).toBeVisible()
    expect(trace.element().textContent).toBe(text)

    const continuation = ' and confirming that applications are still open.'
    const state = store.taskStates[task.id]!
    store.taskStates = {
        [task.id]: {
            ...state,
            events: [
                ...state.events,
                { type: 'message', textDelta: continuation, startsNewStatement: false, createdAt },
            ],
        },
    }
    await nextTick()
    await expect.element(trace).toBeVisible()
    expect(trace.element().textContent).toBe(text + continuation)

    const progress = page.getByTestId('agent-progress').element()
    expect(progress.scrollWidth).toBeLessThanOrEqual(progress.clientWidth)
    const range = document.createRange()
    range.selectNodeContents(trace.element())
    const bounds = trace.element().getBoundingClientRect()
    expect(
        Array.from(range.getClientRects()).every(
            (line) => line.right <= bounds.right + 1 && line.bottom <= bounds.bottom + 1,
        ),
    ).toBe(true)

    await userEvent.keyboard('{Enter}')
    await expect.element(trace).not.toBeVisible()
})
