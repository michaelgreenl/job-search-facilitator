import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import {
    AUTOMATION_DAYS,
    type Automation,
    type UpdateAutomation,
} from '@job-search-facilitator/core'
import SettingsView from '@/views/SettingsView.vue'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

const initial: Automation = {
    id: 'search',
    name: 'Weekday job search',
    status: 'PAUSED',
    schedule: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], times: ['08:00'] },
    timeZone: 'America/Detroit',
    nextScheduledAt: null,
    revision: 'a'.repeat(64),
}
afterEach(async () => page.viewport(1024, 768))

it('saves a schedule without resuming it and waits for successful pause/resume responses', async () => {
    let saved = structuredClone(initial)
    const sent: UpdateAutomation[] = []
    let fail = false
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        if (url.endsWith('/resumes')) return Response.json([])
        if (!init) return Response.json([saved])
        const body = JSON.parse(init.body as string) as UpdateAutomation
        sent.push(body)
        if (fail) return Response.json({ error: 'Save failed. Try again.' }, { status: 503 })
        saved = { ...saved, ...body, revision: 'b'.repeat(64) }
        return Response.json(saved)
    })
    mountVue(SettingsView)
    await page.getByTestId('edit-search').click()
    await page.getByTestId('automation-hour').fill('8')
    await userEvent.keyboard('{ArrowUp}')
    await page.getByTestId('automation-minute').fill('30')
    page.getByTestId('day-TU').element().focus()
    await userEvent.keyboard(' ')
    await page.getByTestId('save-automation-schedule').click()
    expect(sent[0]).toEqual({
        revision: initial.revision,
        schedule: { days: ['MO', 'WE', 'TH', 'FR'], times: ['09:30'] },
    })
    await expect.element(page.getByTestId('status-search')).toHaveTextContent('Paused')
    fail = true
    await page.getByTestId('toggle-search').click()
    await expect.element(page.getByRole('alert')).toBeVisible()
    await expect.element(page.getByTestId('status-search')).toHaveTextContent('Paused')
    fail = false
    await page.getByTestId('toggle-search').click()
    await expect.element(page.getByTestId('status-search')).toHaveTextContent('Active')
    await page.getByTestId('toggle-search').click()
    await expect.element(page.getByTestId('status-search')).toHaveTextContent('Paused')
    expect(sent.slice(1)).toEqual([
        { revision: 'b'.repeat(64), status: 'ACTIVE' },
        { revision: 'b'.repeat(64), status: 'ACTIVE' },
        { revision: 'b'.repeat(64), status: 'PAUSED' },
    ])
})

it.each([
    {
        preset: 'daily',
        days: [...AUTOMATION_DAYS],
        hour: '12',
        minute: '00',
        period: 'am',
        time: '00:00',
    },
    {
        preset: 'weekdays',
        days: ['MO', 'TU', 'WE', 'TH', 'FR'],
        hour: '12',
        minute: '00',
        period: 'pm',
        time: '12:00',
    },
    {
        preset: 'weekends',
        days: ['SA', 'SU'],
        hour: '9',
        minute: '15',
        period: 'pm',
        time: '21:15',
    },
    { preset: 'weekly', days: ['TU'], hour: '6', minute: '05', period: 'am', time: '06:05' },
])('saves the $preset preset and converts $hour:$minute $period', async (scenario) => {
    const sent: UpdateAutomation[] = []
    const automation = { ...initial, schedule: { days: ['TU', 'FR'], times: ['08:00'] } }
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        if (url.endsWith('/resumes')) return Response.json([])
        if (!init) return Response.json([automation])
        const body = JSON.parse(init.body as string) as UpdateAutomation
        sent.push(body)
        return Response.json({ ...automation, ...body })
    })
    mountVue(SettingsView)
    await page.getByTestId('edit-search').click()
    await page.getByTestId(`preset-${scenario.preset}`).click()
    for (const day of AUTOMATION_DAYS) {
        expect((page.getByTestId(`day-${day}`).element() as HTMLInputElement).checked).toBe(
            scenario.days.includes(day),
        )
    }
    await page.getByTestId('automation-hour').fill(scenario.hour)
    await page.getByTestId('automation-minute').fill(scenario.minute)
    await page.getByTestId(`automation-${scenario.period}`).click()
    await page.getByTestId('save-automation-schedule').click()
    expect(sent).toEqual([
        {
            revision: initial.revision,
            schedule: { days: scenario.days, times: [scenario.time] },
        },
    ])
})

it.each([320, 656, 1024])(
    'keeps schedule controls and failed edits usable at %ipx',
    async (width) => {
        await page.viewport(width, 768)
        const automation = {
            ...initial,
            name: 'Weekday software job search with application tracking and long schedule name',
        }
        vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
            if (url.endsWith('/resumes')) return Response.json([])
            if (init)
                return Response.json(
                    { error: 'Changed elsewhere. Refresh before saving.' },
                    { status: 409 },
                )
            return Response.json([automation])
        })
        mountVue(SettingsView)
        const edit = page.getByTestId('edit-search')
        await expect.element(edit).toBeVisible()
        const row = page.getByTestId('automation-search').element().getBoundingClientRect()
        for (const id of ['edit-search', 'toggle-search']) {
            const bounds = page.getByTestId(id).element().getBoundingClientRect()
            expect(
                bounds.left >= row.left && bounds.right <= row.right && bounds.bottom <= row.bottom,
            ).toBe(true)
        }
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth)
        edit.element().focus()
        await userEvent.keyboard('{Enter}')
        const dialog = page.getByTestId('automation-schedule-dialog')
        await expect.element(dialog).toBeVisible()
        const dayBounds = AUTOMATION_DAYS.map((day) =>
            page.getByTestId(`day-${day}`).element().getBoundingClientRect(),
        )
        expect(new Set(dayBounds.map((bounds) => bounds.top)).size).toBe(1)
        const dialogBounds = dialog.element().getBoundingClientRect()
        for (const bounds of dayBounds) {
            expect(
                bounds.width >= 24 &&
                    bounds.height >= 44 &&
                    bounds.left >= dialogBounds.left &&
                    bounds.right <= dialogBounds.right,
            ).toBe(true)
        }
        await page.getByTestId('automation-hour').fill('10')
        await page.getByTestId('automation-minute').fill('45')
        await page.getByTestId('save-automation-schedule').click()
        await expect.element(dialog.getByRole('alert')).toBeVisible()
        await expect.element(page.getByTestId('automation-hour')).toHaveValue(10)
        await expect.element(page.getByTestId('automation-minute')).toHaveValue(45)
        const bounds = dialog.element().getBoundingClientRect()
        expect(
            bounds.left >= 0 &&
                bounds.right <= innerWidth &&
                bounds.top >= 0 &&
                bounds.bottom <= innerHeight,
        ).toBe(true)
        await userEvent.keyboard('{Escape}')
        await expect.element(dialog).not.toBeVisible()
        await expect.element(edit).toHaveFocus()
        await edit.click()
        await expect.element(page.getByTestId('automation-hour')).toHaveValue(8)
        await expect.element(page.getByTestId('automation-minute')).toHaveValue(0)
    },
)

it('recovers a failed automation load without blocking resume settings', async () => {
    let offline = true
    vi.stubGlobal('fetch', async (url: string) => {
        if (url.endsWith('/resumes')) return Response.json([])
        if (offline) throw new Error('Bridge unavailable')
        return Response.json([initial])
    })
    mountVue(SettingsView)
    await expect.element(page.getByTestId('automation-settings').getByRole('alert')).toBeVisible()
    await expect.element(page.getByTestId('add-resume')).toBeEnabled()
    offline = false
    await page.getByTestId('retry-automations').click()
    await expect.element(page.getByTestId('edit-search')).toBeEnabled()
})

it.each([320, 1024])(
    'edits, adds, removes and reloads multiple run times at %ipx',
    async (width) => {
        await page.viewport(width, 768)
        let saved: Automation = {
            ...initial,
            schedule: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], times: ['10:00', '17:30'] },
        }
        const sent: UpdateAutomation[] = []
        vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
            if (url.endsWith('/resumes')) return Response.json([])
            if (!init) return Response.json([saved])
            const body = JSON.parse(init.body as string) as UpdateAutomation
            sent.push(body)
            saved = { ...saved, ...body, revision: 'b'.repeat(64) }
            return Response.json(saved)
        })
        mountVue(SettingsView)
        await page.getByTestId('edit-search').click()
        const dialog = page.getByTestId('automation-schedule-dialog')
        await expect.element(page.getByTestId('save-automation-schedule')).toBeDisabled()
        expect(dialog.element().scrollWidth).toBeLessThanOrEqual(dialog.element().clientWidth)
        await page.getByTestId('remove-time-0').click()
        await expect.element(page.getByTestId('automation-hour')).toHaveFocus()
        await expect.element(page.getByTestId('automation-hour')).toHaveValue(5)
        const addTime = page.getByTestId('add-automation-time')
        await addTime.hover()
        const tooltip = dialog.getByTestId('button-tooltip-content')
        await expect.element(tooltip).toBeVisible()
        expect(tooltip.element().getBoundingClientRect().bottom).toBeLessThan(
            addTime.element().getBoundingClientRect().top,
        )
        await addTime.click()
        const added = page.getByTestId('automation-time-1')
        await expect.element(added.getByTestId('automation-hour')).toHaveFocus()
        await added.getByTestId('automation-hour').fill('5')
        await added.getByTestId('automation-minute').fill('30')
        await added.getByTestId('automation-pm').click()
        await page.getByTestId('save-automation-schedule').click()
        await expect.element(dialog.getByRole('alert')).toBeVisible()
        expect(sent).toEqual([])
        await added.getByTestId('automation-hour').fill('9')
        await added.getByTestId('automation-minute').fill('15')
        await added.getByTestId('automation-am').click()
        await page.getByTestId('save-automation-schedule').click()
        expect(sent[0]).toEqual({
            revision: initial.revision,
            schedule: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], times: ['09:15', '17:30'] },
        })
        await page.getByTestId('refresh-automations').click()
        await page.getByTestId('edit-search').click()
        await expect
            .element(page.getByTestId('automation-time-0').getByTestId('automation-hour'))
            .toHaveValue(9)
        await expect
            .element(page.getByTestId('automation-time-1').getByTestId('automation-pm'))
            .toBeChecked()
        await page.getByTestId('remove-time-1').click()
        await page.getByTestId('save-automation-schedule').click()
        expect(sent[1]).toEqual({
            revision: 'b'.repeat(64),
            schedule: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], times: ['09:15'] },
        })
    },
)
