# Agent bridge

The agent bridge is the host-side adapter between the client and a supported agent runtime. The current harness starts the bundled Codex app-server, discovers the installed Chrome capability, and exposes task state and progress over a loopback HTTP API.

It must run on macOS rather than in Docker because the ChatGPT login, bundled runtime, and Chrome extension live on the host. The Docker server remains responsible for durable application data such as outreach runs.

## Run locally

Install and enable the Chrome plugin used by the Codex runtime, then run from the repository root:

```sh
pnpm dev:agent
```

The bridge listens on `127.0.0.1:3001` by default. See `.env.example` for its optional configuration. `CODEX_BIN` only needs to be set when the ChatGPT app is not installed in its standard macOS location.

## Agent context

Application tasks use `.local/agent-codex` as a separate `CODEX_HOME`. Set `AGENT_CODEX_HOME` to use another private directory.

Startup copies the current sign-in and model metadata. It copies only model settings and the browser runtime service configuration. It registers only the installed Chrome skill. Personal instructions, skills, plugins, hooks, and past conversations are excluded. Project instruction files are disabled. Each task checks the runtime's instruction sources before it starts.

Browser tasks receive Chrome's required instructions. Draft requests receive no skill catalog or browser tools. Codex's built-in instructions still apply.

Failed task state is excluded from refresh restoration. A retry after malformed output starts a new task with the original request context.

The bridge requests Chrome's native tab cleanup after browser turns and cancellation. Cleanup targets that task's browser session. Existing user tabs remain open. A runtime crash can prevent cleanup.

## Scheduled job search

Run the application policy in an isolated runtime:

```sh
pnpm run job-search:run --check
pnpm run job-search:run
```

The runner reads `docs/agents/job-search/automation.md` and uses `.local/job-search-codex`. The check verifies instruction isolation and browser availability without starting a search. Set `JOB_SEARCH_CODEX_HOME` to change that directory. `JOB_SEARCH_MODEL` and `JOB_SEARCH_REASONING_EFFORT` preserve schedule-specific model settings.

The scheduled desktop task must launch this command and report its result. Its own desktop instructions still apply to the launcher. They do not enter the isolated coordinator or workers. The runner uses automatic approval review. Requests that need interactive approval stop the run and report the required action.

## Local API

- `GET /health` reports current Agent runtime readiness and its discovered capabilities.
- `POST /tasks` starts a structured task.
- `GET /tasks/:id` returns its current state.
- `POST /tasks/:id/cancel` interrupts a running task.
- `GET /tasks/:id/events` streams user-safe progress with server-sent events.

Task events and output are held in memory for the life of the bridge process. Durable workflow state belongs in the Docker API. The bridge is intentionally bound to loopback and starts Agent tasks with a read-only sandbox and no approval escalation.

Task output contracts are validated as synchronous JSON Schema draft-07 with an explicit object root. The public task contract omits dialect markers and `format` validators; use structural keywords such as `pattern` when a task needs a format constraint. Schemas containing `$schema`, `format`, asynchronous validation, or anything else the bridge cannot compile are rejected before an Agent task starts.

The bridge does not restart the Agent runtime after an unexpected runtime error or exit. Existing task state remains available for inspection, but health and new task requests return `503` until the bridge process is restarted with `pnpm dev:agent`. A bounded tail of runtime stderr is written to the bridge log on failure and is not exposed through task or health responses.
