import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'smol-toml'
import request from 'supertest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseAutomations } from '@job-search-facilitator/core'
import { createApp } from '../src/http/app.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

let directory: string
const clientOrigin = 'http://localhost:5173'
const projectRoot = '/workspace/job-search'
const original = {
    version: 1,
    id: 'search',
    kind: 'cron',
    name: 'Job search',
    prompt: 'Run the private workflow.',
    status: 'ACTIVE',
    rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=8;BYMINUTE=15;BYDAY=MO,TU,WE,TH,FR',
    cwds: [projectRoot],
    model: 'existing-model',
    reasoning_effort: 'high',
    execution_environment: 'local',
    notification_policy: 'failed_runs_only',
    created_at: 1,
    updated_at: 1,
}
const file = (id = 'search') => join(directory, id, 'automation.toml')
function write(config = original) {
    mkdirSync(join(directory, config.id), { recursive: true })
    writeFileSync(file(config.id), stringify(config))
}
const app = () =>
    createApp(new AgentTaskManager(new FakeRuntime()), clientOrigin, { directory, projectRoot })

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'automation-settings-test-'))
    vi.stubEnv('TZ', 'America/Detroit')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T13:00:00Z'))
    write()
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
})

it('persists pause, schedule changes and resume while preserving the workflow and local time across DST', async () => {
    const server = app()
    const [initial] = parseAutomations((await request(server).get('/automations').expect(200)).body)
    expect(initial!.nextScheduledAt).toBe('2026-11-02T13:15:00.000Z')
    const paused = await request(server)
        .patch('/automations/search')
        .set('Origin', clientOrigin)
        .send({ revision: initial!.revision, status: 'PAUSED' })
        .expect(200)
    expect(parse(readFileSync(file(), 'utf8'))).toEqual({
        ...original,
        status: 'PAUSED',
        updated_at: Date.now(),
    })
    expect(paused.body.nextScheduledAt).toBeNull()

    const scheduled = await request(server)
        .patch('/automations/search')
        .set('Origin', clientOrigin)
        .send({
            revision: paused.body.revision,
            schedule: { days: ['MO', 'WE'], times: ['09:30'] },
        })
        .expect(200)
    expect(parse(readFileSync(file(), 'utf8'))).toEqual({
        ...original,
        status: 'PAUSED',
        rrule: 'RRULE:FREQ=DAILY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=30',
        updated_at: Date.now(),
    })
    const resumed = await request(server)
        .patch('/automations/search')
        .set('Origin', clientOrigin)
        .send({ revision: scheduled.body.revision, status: 'ACTIVE' })
        .expect(200)
    const [reloaded] = parseAutomations((await request(app()).get('/automations').expect(200)).body)
    expect(reloaded).toEqual(resumed.body)
    expect(reloaded).toMatchObject({
        status: 'ACTIVE',
        schedule: { days: ['MO', 'WE'], times: ['09:30'] },
        nextScheduledAt: '2026-11-02T14:30:00.000Z',
    })
})

it('rejects cross-project, cross-origin, stale and invalid edits without changing schedules', async () => {
    write({ ...original, id: 'other', cwds: ['/workspace/other'] })
    symlinkSync(join(directory, 'other'), join(directory, 'linked'))
    const server = app()
    const listed = parseAutomations((await request(server).get('/automations').expect(200)).body)
    expect(listed.map(({ id }) => id)).toEqual(['search'])
    const revision = listed[0]!.revision
    const before = readFileSync(file(), 'utf8')
    const other = readFileSync(file('other'), 'utf8')
    for (const [id, origin, body, code] of [
        ['other', clientOrigin, { revision, status: 'PAUSED' }, 404],
        ['linked', clientOrigin, { revision, status: 'PAUSED' }, 404],
        ['search', 'https://untrusted.example', { revision, status: 'PAUSED' }, 403],
        ['search', clientOrigin, { revision: '0'.repeat(64), status: 'PAUSED' }, 409],
        ['search', clientOrigin, { revision, schedule: { days: [], times: ['09:00'] } }, 400],
        ['search', clientOrigin, { revision, schedule: { days: ['MO'], times: ['25:00'] } }, 400],
        ['search', clientOrigin, { revision, schedule: { days: ['MO'], times: [] } }, 400],
        [
            'search',
            clientOrigin,
            { revision, schedule: { days: ['MO'], times: ['09:00', '09:00'] } },
            400,
        ],
        ['search', clientOrigin, { revision, status: 'PAUSED', prompt: 'replace workflow' }, 400],
    ] as const) {
        await request(server)
            .patch(`/automations/${id}`)
            .set('Origin', origin)
            .send(body)
            .expect(code)
        expect(readFileSync(file(), 'utf8')).toBe(before)
        expect(readFileSync(file('other'), 'utf8')).toBe(other)
    }
})

it('edits and reloads outreach run times without introducing extra runs between them', async () => {
    const outreach = {
        ...original,
        rrule: 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=10,17;BYMINUTE=0,30;BYSETPOS=1,-1',
    }
    write(outreach)
    vi.setSystemTime(new Date('2026-10-30T14:01:00Z'))
    const server = app()
    const [current] = parseAutomations((await request(server).get('/automations').expect(200)).body)
    expect(current).toMatchObject({
        schedule: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], times: ['10:00', '17:30'] },
        nextScheduledAt: '2026-10-30T21:30:00.000Z',
    })
    await request(server)
        .patch('/automations/search')
        .set('Origin', clientOrigin)
        .send({
            revision: current!.revision,
            schedule: { days: ['MO', 'FR'], times: ['18:45', '09:15'] },
        })
        .expect(200)
    expect(parse(readFileSync(file(), 'utf8'))).toEqual({
        ...outreach,
        rrule: 'RRULE:FREQ=DAILY;BYDAY=MO,FR;BYHOUR=9,18;BYMINUTE=15,45;BYSETPOS=1,4',
        updated_at: Date.now(),
    })
    vi.setSystemTime(new Date('2026-10-30T23:00:00Z'))
    const [reloaded] = parseAutomations((await request(app()).get('/automations').expect(200)).body)
    expect(reloaded).toMatchObject({
        status: 'ACTIVE',
        schedule: { days: ['MO', 'FR'], times: ['09:15', '18:45'] },
        nextScheduledAt: '2026-11-02T14:15:00.000Z',
    })
})

it('round trips the maximum run times within the recurrence position limit', async () => {
    const server = app()
    const [current] = parseAutomations((await request(server).get('/automations').expect(200)).body)
    const times = Array.from(
        { length: 24 },
        (_, hour) => `${String(hour).padStart(2, '0')}:${String(hour).padStart(2, '0')}`,
    )
    const saved = await request(server)
        .patch('/automations/search')
        .set('Origin', clientOrigin)
        .send({ revision: current!.revision, schedule: { days: ['MO'], times } })
        .expect(200)
    expect(saved.body.schedule).toEqual({ days: ['MO'], times })
    const rule = parse(readFileSync(file(), 'utf8')).rrule as string
    const positions = rule.split('BYSETPOS=')[1]!.split(',').map(Number)
    expect(positions.every((position) => position !== 0 && Math.abs(position) <= 366)).toBe(true)
})

it.each([
    {
        rule: 'RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2,3;BYMINUTE=15,30;BYSETPOS=2,3',
        times: ['02:30', '03:15'],
        next: '2027-03-14T07:15:00.000Z',
    },
    {
        rule: 'RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2;BYMINUTE=30',
        times: ['02:30'],
        next: '2027-03-21T06:30:00.000Z',
    },
])(
    'skips nonexistent local run times during the spring clock change: $rule',
    async ({ rule, times, next }) => {
        write({
            ...original,
            rrule: rule,
        })
        vi.setSystemTime(new Date('2027-03-13T05:00:00Z'))
        const [current] = parseAutomations(
            (await request(app()).get('/automations').expect(200)).body,
        )
        expect(current).toMatchObject({
            schedule: { days: ['SU'], times },
            nextScheduledAt: next,
        })
    },
)

it.each([
    {
        rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=10,17;BYMINUTE=0,30;BYSETPOS=1,4,5,8,9,12,13,16,17,20',
        days: ['MO', 'TU', 'WE', 'TH', 'FR'],
        times: ['10:00', '17:30'],
    },
    {
        rule: 'RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO,SU;BYHOUR=10,17;BYMINUTE=0,30;BYSETPOS=1',
        days: ['SU'],
        times: ['10:00'],
    },
])(
    'reads weekly recurrence positions across the correct week boundary: $rule',
    async ({ rule, days, times }) => {
        write({ ...original, rrule: rule })
        const [current] = parseAutomations(
            (await request(app()).get('/automations').expect(200)).body,
        )
        expect(current!.schedule).toEqual({ days, times })
    },
)

it.each([
    'RRULE:FREQ=MONTHLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0;BYSETPOS=1',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=10,17;BYMINUTE=0,30;BYSETPOS=1,-1',
])(
    'preserves an unsupported recurrence when pausing and refuses to flatten it: %s',
    async (rrule) => {
        write({ ...original, rrule })
        const server = app()
        const [current] = parseAutomations(
            (await request(server).get('/automations').expect(200)).body,
        )
        expect(current!.schedule).toBeNull()
        const before = readFileSync(file(), 'utf8')
        await request(server)
            .patch('/automations/search')
            .set('Origin', clientOrigin)
            .send({ revision: current!.revision, schedule: { days: ['MO'], times: ['08:00'] } })
            .expect(409)
        expect(readFileSync(file(), 'utf8')).toBe(before)
        await request(server)
            .patch('/automations/search')
            .set('Origin', clientOrigin)
            .send({ revision: current!.revision, status: 'PAUSED' })
            .expect(200)
        expect(parse(readFileSync(file(), 'utf8'))).toEqual({
            ...parse(before),
            status: 'PAUSED',
            updated_at: Date.now(),
        })
    },
)
