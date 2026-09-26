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

it('expands updates by keyboard with the latest message first, no duplicates, and no clipped text', async () => {
    await page.viewport(320, 600)
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useAgentStore()
    const task = makeAgentTask()
    const createdAt = new Date().toISOString()
    const text = `Checking the requirements and the application details at https://example.com/${'role'.repeat(50)}`
    const earlier = ['Reading the role', 'Checking the company']
    store.taskStates[task.id] = makeAgentTaskState(task, {
        events: [
            ...earlier.map((textDelta) => ({
                type: 'message' as const,
                textDelta,
                startsNewStatement: true,
                createdAt,
            })),
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
    const latest = page.getByTestId('agent-reasoning-latest')
    const block = page.getByTestId('agent-stream-commentary').element() as HTMLElement
    const visibleStatements = () => block.innerText.split('\n').filter(Boolean)
    await expect.element(latest).not.toBeVisible()
    toggle.element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(latest).toBeVisible()
    expect(visibleStatements()).toEqual([text, earlier[1], earlier[0]])

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
    await expect.element(latest).toBeVisible()
    expect(visibleStatements()).toEqual([text + continuation, earlier[1], earlier[0]])

    const progress = page.getByTestId('agent-progress').element()
    expect(progress.scrollWidth).toBeLessThanOrEqual(progress.clientWidth)
    const range = document.createRange()
    range.selectNodeContents(latest.element())
    const bounds = latest.element().getBoundingClientRect()
    expect(
        Array.from(range.getClientRects()).every(
            (line) => line.right <= bounds.right + 1 && line.bottom <= bounds.bottom + 1,
        ),
    ).toBe(true)

    const nextStatement = 'Finished reviewing the role'
    store.taskStates = {
        [task.id]: {
            ...store.taskStates[task.id]!,
            events: [
                ...store.taskStates[task.id]!.events,
                { type: 'message', textDelta: nextStatement, startsNewStatement: true, createdAt },
            ],
        },
    }
    await nextTick()
    expect(visibleStatements()).toEqual([
        nextStatement,
        text + continuation,
        earlier[1],
        earlier[0],
    ])

    await userEvent.keyboard('{Enter}')
    await expect.element(latest).not.toBeVisible()
    expect(visibleStatements()).toEqual([nextStatement])
})
