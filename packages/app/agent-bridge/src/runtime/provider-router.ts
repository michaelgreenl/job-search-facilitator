import type {
    AgentCapability,
    AgentPermissionDecision,
    AgentProvider,
    AgentProviderStatus,
    StartAgentTaskInput,
} from '@job-search-facilitator/core'
import type {
    AgentProviderRuntime,
    AgentRuntime,
    AgentRuntimeEvent,
    AgentRuntimeHealth,
    StartedAgentTask,
} from './agent-runtime.ts'

type Providers = Record<AgentProvider, AgentProviderRuntime>

/** Sends each task to the selected provider. A continued conversation stays with its provider. */
export class ProviderRouter implements AgentRuntime {
    private readonly threads = new Map<string, { provider: AgentProvider; turnId: string }>()
    private readonly eventListeners = new Set<(event: AgentRuntimeEvent) => void>()

    constructor(
        private readonly providers: Providers,
        private readonly selected: () => AgentProvider,
        private readonly findProvider: (threadId: string) => Promise<AgentProvider>,
        /** Reports whether the user lets the provider use the plugin behind a capability. */
        private readonly allows: (
            provider: AgentProvider,
            capability: AgentCapability,
        ) => boolean = () => true,
    ) {
        for (const provider of Object.keys(providers) as AgentProvider[]) {
            providers[provider].onEvent((event) => this.forward(provider, event))
        }
    }

    get health(): AgentRuntimeHealth {
        const provider = this.selected()
        const { health } = this.providers[provider]

        return health.status === 'healthy'
            ? {
                  ...health,
                  capabilities: health.capabilities.filter((capability) =>
                      this.allows(provider, capability),
                  ),
              }
            : health
    }

    status(): Promise<AgentProviderStatus[]> {
        return Promise.all(
            (Object.keys(this.providers) as AgentProvider[]).map(async (id) => {
                const { health } = this.providers[id]
                if (health.status === 'unavailable') {
                    return { id, available: false, error: health.error, models: [] }
                }

                try {
                    const models = await this.providers[id].listModels()
                    return { id, available: true, error: null, models }
                } catch {
                    return { id, available: true, error: null, models: [] }
                }
            }),
        )
    }

    async startTask(taskId: string, input: StartAgentTaskInput): Promise<StartedAgentTask> {
        const provider =
            input.threadId === undefined
                ? this.selected()
                : (this.threads.get(input.threadId)?.provider ??
                  (await this.findProvider(input.threadId)))
        const blocked = input.capabilities.find((capability) => !this.allows(provider, capability))
        if (blocked !== undefined) throw new Error(`Agent capability is unavailable: ${blocked}`)

        const started = await this.providers[provider].startTask(taskId, input)
        this.threads.set(started.threadId, { provider, turnId: started.turnId })

        return started
    }

    interruptTask(threadId: string, turnId: string): Promise<void> {
        const provider = this.threads.get(threadId)?.provider ?? this.selected()
        return this.providers[provider].interruptTask(threadId, turnId)
    }

    resolvePermission(permissionId: string, decision: AgentPermissionDecision): boolean {
        return Object.values(this.providers).some((provider) =>
            provider.resolvePermission(permissionId, decision),
        )
    }

    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    private forward(provider: AgentProvider, event: AgentRuntimeEvent): void {
        // One provider's failure ends only the tasks that provider runs.
        const events: AgentRuntimeEvent[] =
            event.type === 'runtime-failed'
                ? [...this.threads]
                      .filter(([, thread]) => thread.provider === provider)
                      .map(([threadId, { turnId }]) => ({
                          type: 'turn-completed',
                          threadId,
                          turnId,
                          status: 'failed',
                          error: event.error.message,
                      }))
                : [event]

        for (const forwarded of events) {
            for (const listener of this.eventListeners) listener(forwarded)
        }
    }
}
