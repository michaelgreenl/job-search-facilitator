import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import AgentStream from '@/components/agent/AgentStream.vue'
import AgentTaskPanel from '@/components/agent/AgentTaskPanel.vue'
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
    const heading = 'Preparing tailored application documents'
    store.taskStates[task.id] = makeAgentTaskState(task, {
        events: [
            { type: 'activity', message: 'Task started', createdAt },
            { type: 'activity', message: 'Using Chrome', createdAt },
            {
                type: 'message',
                textDelta: 'Verifying the role and employer details',
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
    expect((trace.element() as HTMLElement).innerText).toBe(
        'Verifying the role and employer details',
    )
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

it.each([320, 1024])('keeps startup in the first block at the bottom at %ipx', async (width) => {
    await page.viewport(width, 600)
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useAgentStore()
    const task = makeAgentTask()
    const createdAt = new Date().toISOString()
    store.taskStates[task.id] = makeAgentTaskState(null, { taskId: task.id, starting: true })
    mountVue(
        defineComponent(
            () => () =>
                h(AgentTaskPanel, {
                    active: true,
                    adjacent: false,
                    taskId: task.id,
                    eyebrow: 'Job post import',
                    title: 'Add job post',
                    backLabel: 'Back',
                    backTestId: 'task-back',
                    cancelling: false,
                    running: false,
                    issue: null,
                    statusMessage: store.taskStates[task.id]!.starting ? 'Starting Agent…' : null,
                    statusTestId: 'task-start-status',
                    cancelTestId: 'task-cancel',
                }),
        ),
        {
            install: (app) => app.use(pinia),
            style: {
                display: 'flex',
                flexDirection: 'column',
                height: '480px',
                width: `${Math.min(width - 40, 640)}px`,
            },
        },
    )
    const progress = page.getByTestId('agent-progress')
    const status = page.getByTestId('task-start-status')
    await expect.element(status).toBeVisible()
    const firstBlock = page.getByTestId('agent-stream-block')
    expect(firstBlock.element().contains(status.element())).toBe(true)
    expect(
        Math.abs(
            firstBlock.element().getBoundingClientRect().bottom -
                progress.element().getBoundingClientRect().bottom,
        ),
    ).toBeLessThan(1)

    store.taskStates = {
        [task.id]: makeAgentTaskState(task, {
            events: [
                { type: 'activity', message: 'Task started', createdAt },
                { type: 'activity', message: 'Reading local context', createdAt },
                { type: 'activity', message: 'Using Chrome', createdAt },
                {
                    type: 'message',
                    textDelta: 'Verifying the role and employer details',
                    startsNewStatement: true,
                    createdAt,
                },
            ],
        }),
    }
    await nextTick()
    expect(page.getByTestId('task-start-status').elements()).toHaveLength(0)
    expect(page.getByTestId('agent-stream-block').elements()).toHaveLength(1)
    expect(firstBlock.element().contains(page.getByTestId('agent-stream-activity').element())).toBe(
        true,
    )
    expect(
        firstBlock.element().contains(page.getByTestId('agent-reasoning-latest').element()),
    ).toBe(true)
    expect(page.getByTestId('agent-reasoning-toggle').elements()).toHaveLength(0)
})
