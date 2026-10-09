import { createHash, randomUUID } from 'node:crypto'
import {
    existsSync,
    lstatSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import {
    AUTOMATION_DAYS,
    automationScheduleSchema,
    updateAutomationSchema,
    type Automation,
    type AutomationSchedule,
} from '@job-search-facilitator/core'
import express from 'express'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'

const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/)
const configSchema = z.object({
    version: z.literal(1),
    id: idSchema,
    name: z.string().min(1),
    status: z.enum(['ACTIVE', 'PAUSED']),
    rrule: z.string(),
})
const revision = (source: string) => createHash('sha256').update(source).digest('hex')

function numbers(value: string | undefined, min: number, max: number) {
    if (!value || !/^[+-]?\d+(,[+-]?\d+)*$/.test(value)) return null
    const values = [...new Set(value.split(',').map(Number))].sort((a, b) => a - b)
    return values.every((value) => value >= min && value <= max) ? values : null
}

const clockTime = (hour: number, minute: number) =>
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

function readSchedule(rule: string): AutomationSchedule | null {
    const entries = rule
        .replace(/^RRULE:/, '')
        .split(';')
        .map((field) => field.split('='))
    const fields = Object.fromEntries(entries)
    // Only edit the daily/weekly schedules this form can preserve without loss.
    if (
        entries.some((entry) => entry.length !== 2) ||
        new Set(entries.map(([key]) => key)).size !== entries.length ||
        Object.keys(fields).some(
            (key) =>
                ![
                    'FREQ',
                    'BYDAY',
                    'BYHOUR',
                    'BYMINUTE',
                    'BYSECOND',
                    'BYSETPOS',
                    'INTERVAL',
                    'WKST',
                ].includes(key),
        ) ||
        !['DAILY', 'WEEKLY'].includes(fields.FREQ ?? '') ||
        (fields.INTERVAL !== undefined && fields.INTERVAL !== '1') ||
        (fields.BYSECOND !== undefined && fields.BYSECOND !== '0') ||
        (fields.WKST !== undefined &&
            !AUTOMATION_DAYS.includes(fields.WKST as (typeof AUTOMATION_DAYS)[number])) ||
        (fields.FREQ === 'WEEKLY' && !fields.BYDAY)
    )
        return null
    const parsedDays = automationScheduleSchema.shape.days.safeParse(
        fields.BYDAY?.split(',') ?? [...AUTOMATION_DAYS],
    )
    if (!parsedDays.success) return null
    let days = parsedDays.data
    const hours = numbers(fields.BYHOUR, 0, 23)
    const minutes = numbers(fields.BYMINUTE, 0, 59)
    if (!hours || !minutes) return null
    let times = hours.flatMap((hour) => minutes.map((minute) => clockTime(hour, minute)))
    if (fields.BYSETPOS !== undefined) {
        const positions = numbers(fields.BYSETPOS, -366, 366)
        if (!positions || positions.includes(0)) return null
        const weekStart = AUTOMATION_DAYS.indexOf(
            (fields.WKST ?? 'MO') as (typeof AUTOMATION_DAYS)[number],
        )
        const weekDays = [
            ...AUTOMATION_DAYS.slice(weekStart),
            ...AUTOMATION_DAYS.slice(0, weekStart),
        ].filter((day) => days.includes(day))
        const periodDays = fields.FREQ === 'WEEKLY' ? weekDays : ['']
        const candidates = periodDays.flatMap((day) => times.map((time) => ({ day, time })))
        const selected = [
            ...new Set(
                positions.flatMap((position) => {
                    const occurrence = candidates.at(position > 0 ? position - 1 : position)
                    return occurrence ? [occurrence] : []
                }),
            ),
        ]
        times = [...new Set(selected.map(({ time }) => time))]
        if (fields.FREQ === 'WEEKLY') {
            days = days.filter((day) => selected.some((occurrence) => occurrence.day === day))
            // This editor applies the same run times to every selected day.
            if (selected.length !== days.length * times.length) return null
        }
    }
    const parsed = automationScheduleSchema.safeParse({ days, times })
    return parsed.success ? parsed.data : null
}

function writeSchedule({ days, times }: AutomationSchedule) {
    const hours = [...new Set(times.map((time) => Number(time.slice(0, 2))))].sort((a, b) => a - b)
    const minutes = [...new Set(times.map((time) => Number(time.slice(3))))].sort((a, b) => a - b)
    const candidates = hours.flatMap((hour) => minutes.map((minute) => clockTime(hour, minute)))
    let rule = `RRULE:FREQ=DAILY;BYDAY=${AUTOMATION_DAYS.filter((day) => days.includes(day)).join(',')};BYHOUR=${hours.join(',')};BYMINUTE=${minutes.join(',')}`
    if (candidates.length !== times.length) {
        const positions = times.map((time) => {
            const index = candidates.indexOf(time)
            // The 24-time limit keeps every position within RFC 5545's ±366 range.
            return index < 366 ? index + 1 : index - candidates.length
        })
        rule += `;BYSETPOS=${positions.join(',')}`
    }
    return rule
}

function nextScheduledAt(schedule: AutomationSchedule | null, status: Automation['status']) {
    if (!schedule || status === 'PAUSED') return null
    const now = new Date()
    // A clock change can skip this week's only run.
    for (let offset = 0; offset <= 14; offset++) {
        for (const time of schedule.times) {
            const [hour, minute] = time.split(':').map(Number)
            const next = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() + offset,
                hour,
                minute,
            )
            if (
                next > now &&
                next.getHours() === hour &&
                next.getMinutes() === minute &&
                schedule.days.includes(AUTOMATION_DAYS[(next.getDay() + 6) % 7]!)
            )
                return next.toISOString()
        }
    }
    return null
}

export function createAutomationRouter(
    directory: string,
    projectRoot: string,
    clientOrigin: string,
) {
    const router = express.Router()

    function read(id: string) {
        const folder = join(directory, id)
        const path = join(folder, 'automation.toml')
        if (!existsSync(path) || !lstatSync(folder).isDirectory() || !lstatSync(path).isFile())
            return null
        const source = readFileSync(path, 'utf8')
        const document = parse(source)
        if (
            (document.kind !== undefined && document.kind !== 'cron') ||
            document.status === 'DELETED' ||
            !Array.isArray(document.cwds) ||
            !document.cwds.some(
                (cwd) => typeof cwd === 'string' && resolve(cwd) === resolve(projectRoot),
            )
        )
            return null
        const config = configSchema.parse(document)
        if (config.id !== id) throw new Error('Automation identity mismatch')
        const schedule = readSchedule(config.rrule)
        const automation: Automation = {
            id,
            name: config.name,
            status: config.status,
            schedule,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            nextScheduledAt: nextScheduledAt(schedule, config.status),
            revision: revision(source),
        }
        return { path, source, document, automation }
    }

    router.get('/automations', (_request, response) => {
        try {
            const entries = existsSync(directory)
                ? readdirSync(directory, { withFileTypes: true })
                : []
            const automations = entries
                .filter((entry) => entry.isDirectory() && idSchema.safeParse(entry.name).success)
                .map((entry) => read(entry.name)?.automation)
                .filter((entry) => entry !== undefined)
                .sort((a, b) => a.name.localeCompare(b.name))
            response.set('Cache-Control', 'no-store').json(automations)
        } catch {
            response.status(503).json({
                error: 'Could not read local automations. Check the desktop app and try again.',
            })
        }
    })

    router.patch('/automations/:id', (request, response) => {
        if (request.get('Origin') !== clientOrigin || !request.is('application/json')) {
            response
                .status(403)
                .json({ error: 'Automation changes must come from this application.' })
            return
        }
        const id = idSchema.safeParse(request.params.id)
        const input = updateAutomationSchema.safeParse(request.body)
        if (!id.success || !input.success) {
            response.status(400).json({ error: 'Choose at least one day and a valid time.' })
            return
        }
        let temporary: string | undefined
        try {
            const current = read(id.data)
            if (!current) {
                response.status(404).json({
                    error: 'This local automation is no longer available. Refresh the list.',
                })
                return
            }
            if (current.automation.revision !== input.data.revision) {
                response.status(409).json({
                    error: 'This automation changed elsewhere. Refresh the list before saving.',
                })
                return
            }
            if (input.data.schedule && current.automation.schedule === null) {
                response
                    .status(409)
                    .json({ error: 'Edit this custom schedule in the desktop app.' })
                return
            }
            const updated: typeof current.document = { ...current.document, updated_at: Date.now() }
            if (input.data.status) updated.status = input.data.status
            if (input.data.schedule) {
                updated.rrule = writeSchedule(input.data.schedule)
            }
            temporary = `${current.path}.${randomUUID()}.tmp`
            writeFileSync(temporary, stringify(updated), {
                mode: lstatSync(current.path).mode & 0o777,
                flag: 'wx',
            })
            if (readFileSync(current.path, 'utf8') !== current.source) {
                response.status(409).json({
                    error: 'This automation changed elsewhere. Refresh the list before saving.',
                })
                return
            }
            renameSync(temporary, current.path)
            response.json(read(id.data)!.automation)
        } catch {
            response.status(503).json({
                error: 'Could not save the automation. Refresh the list to check its state.',
            })
        } finally {
            if (temporary) rmSync(temporary, { force: true })
        }
    })
    return router
}
