import type {
    AgentModelSelection,
    AgentProvider,
    AutomationRun,
} from '@job-search-facilitator/core'

export interface AutomationRunInput {
    prompt: string
    cwd: string
    /** Null runs with the provider's own default. */
    model: AgentModelSelection | null
    signal: AbortSignal
    onProgress: (text: string) => void
}

/** Runs one automation prompt to its end and returns the final message. */
export type AutomationRunner = (input: AutomationRunInput) => Promise<string>

const maxMessageLength = 2_000

/** Starts automation runs for the Settings page and keeps the state of the latest run of each. */
export class AutomationRuns {
    private readonly runs = new Map<string, { run: AutomationRun; abort: AbortController }>()

    constructor(private readonly runners: Record<AgentProvider, AutomationRunner>) {}

    get(id: string): AutomationRun | null {
        return this.runs.get(id)?.run ?? null
    }

    /** Returns false when the automation is already running. */
    start(
        id: string,
        provider: AgentProvider,
        input: Omit<AutomationRunInput, 'signal' | 'onProgress'>,
    ): boolean {
        if (this.get(id)?.status === 'running') return false

        const abort = new AbortController()
        const entry = {
            abort,
            run: {
                status: 'running',
                startedAt: new Date().toISOString(),
                finishedAt: null,
                message: null,
            } as AutomationRun,
        }
        const update = (changes: Partial<AutomationRun>) => {
            // A newer run of the same automation replaces this entry.
            if (this.runs.get(id) === entry) entry.run = { ...entry.run, ...changes }
        }
        const message = (text: string) => text.trim().slice(0, maxMessageLength) || null
        this.runs.set(id, entry)

        void this.runners[provider]({
            ...input,
            signal: abort.signal,
            onProgress: (text) => update({ message: message(text) }),
        }).then(
            (result) =>
                update({
                    status: 'completed',
                    finishedAt: new Date().toISOString(),
                    message: message(result),
                }),
            (error: unknown) =>
                update({
                    status: abort.signal.aborted ? 'cancelled' : 'failed',
                    finishedAt: new Date().toISOString(),
                    message: abort.signal.aborted
                        ? null
                        : message(error instanceof Error ? error.message : 'The run failed'),
                }),
        )

        return true
    }

    /** Returns false when the automation is not running. */
    cancel(id: string): boolean {
        const entry = this.runs.get(id)
        if (entry?.run.status !== 'running') return false

        entry.abort.abort()
        return true
    }

    cancelAll(): void {
        for (const id of this.runs.keys()) this.cancel(id)
    }
}
