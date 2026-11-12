import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

export interface ClaudeTask {
    id: string
    name: string
    enabled: boolean
    prompt: string
}

const storeSchema = z.object({
    scheduledTasks: z.array(
        z.object({
            id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/),
            displayName: z.string().min(1).optional(),
            enabled: z.boolean().optional(),
            filePath: z.string().min(1),
            cwd: z.string().optional(),
        }),
    ),
})

const directories = (path: string) =>
    existsSync(path)
        ? readdirSync(path, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => join(path, entry.name))
        : []

/**
 * Lists the Claude desktop app's scheduled tasks for one project. The app keeps
 * one task list for each account and organization. Each task's prompt is the
 * body of its SKILL.md file. A list or task that cannot be read is left out.
 */
export function readClaudeTasks(appData: string, projectRoot: string): ClaudeTask[] {
    const stores = directories(join(appData, 'claude-code-sessions'))
        .flatMap(directories)
        .map((directory) => join(directory, 'scheduled-tasks.json'))

    return stores.flatMap((path) => {
        try {
            const { scheduledTasks } = storeSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
            return scheduledTasks.flatMap((task) => {
                if (task.cwd === undefined || resolve(task.cwd) !== resolve(projectRoot)) return []
                const prompt = readFileSync(task.filePath, 'utf8')
                    .replace(/^---\n[\s\S]*?\n---\n/, '')
                    .trim()
                return prompt
                    ? [
                          {
                              id: task.id,
                              name: task.displayName ?? task.id,
                              enabled: task.enabled !== false,
                              prompt,
                          },
                      ]
                    : []
            })
        } catch {
            return []
        }
    })
}
