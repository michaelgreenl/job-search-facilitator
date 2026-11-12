import type { AgentProvider, StartAgentTaskInput } from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import type { AgentProviderRuntime, StartedAgentTask } from '../src/runtime/agent-runtime.ts'
import { ProviderRouter } from '../src/runtime/provider-router.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

class FakeProvider extends FakeRuntime implements AgentProviderRuntime {
    constructor(private readonly name: AgentProvider) {
        super()
    }

    override async startTask(
        taskId: string,
        input: StartAgentTaskInput,
    ): Promise<StartedAgentTask> {
        await super.startTask(taskId, input)
        return {
            threadId: input.threadId ?? `${this.name}-thread`,
            turnId: `${this.name}-turn-${this.startAttempts}`,
        }
    }

    listModels() {
        return Promise.resolve([])
    }
}

const input: StartAgentTaskInput = {
    prompt: 'Find contacts',
    outputSchema: { type: 'object' },
    capabilities: [],
}

const createRouter = () => {
    const providers = { codex: new FakeProvider('codex'), claude: new FakeProvider('claude') }
    const selection: { provider: AgentProvider } = { provider: 'claude' }
    const router = new ProviderRouter(
        providers,
        () => selection.provider,
        () => Promise.resolve('codex'),
    )

    return { providers, router, selection }
}

describe('Provider router', () => {
    it('starts a new task with the selected provider', async () => {
        const { providers, router } = createRouter()

        await router.startTask('task-id', input)

        expect(providers.claude.startAttempts).toBe(1)
        expect(providers.codex.startAttempts).toBe(0)
    })

    it('continues a conversation with the provider that started it', async () => {
        const { providers, router, selection } = createRouter()
        const { threadId } = await router.startTask('task-id', input)

        selection.provider = 'codex'
        await router.startTask('next-task-id', { ...input, threadId })

        expect(providers.claude.startAttempts).toBe(2)
        expect(providers.codex.startAttempts).toBe(0)
    })

    it('fails only the tasks of the provider that failed', async () => {
        const { providers, router, selection } = createRouter()
        const manager = new AgentTaskManager(router)
        const claudeTask = await manager.start(input)
        selection.provider = 'codex'
        const codexTask = await manager.start(input)

        providers.codex.fail(new Error('Codex stopped'))

        expect(manager.get(codexTask.id)).toMatchObject({ status: 'failed' })
        expect(manager.get(claudeTask.id)).toMatchObject({ status: 'running' })
    })
})
