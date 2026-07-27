# Work bridge

The work bridge is the host-side adapter between the client and ChatGPT Work. It starts the bundled Codex app-server, discovers the installed Chrome capability, and exposes task state and progress over a loopback HTTP API.

It must run on macOS rather than in Docker because the ChatGPT login, bundled runtime, and Chrome extension live on the host. The Docker server remains responsible for durable application data such as outreach runs.

## Run locally

Install and enable the Chrome plugin in ChatGPT Work, then run from the repository root:

```sh
pnpm dev:work
```

The bridge listens on `127.0.0.1:3001` by default. See `.env.example` for its optional configuration. `CODEX_BIN` only needs to be set when the ChatGPT app is not installed in its standard macOS location.

## Local API

- `GET /health` reports current Work runtime readiness and its discovered capabilities.
- `POST /tasks` starts a structured task.
- `GET /tasks/:id` returns its current state.
- `POST /tasks/:id/cancel` interrupts a running task.
- `GET /tasks/:id/events` streams user-safe progress with server-sent events.

Task events and output are held in memory for the life of the bridge process. Durable workflow state belongs in the Docker API. The bridge is intentionally bound to loopback and starts Work tasks with a read-only sandbox and no approval escalation.

Task output contracts are validated as synchronous JSON Schema draft-07 with an explicit object root. The public task contract omits dialect markers and `format` validators; use structural keywords such as `pattern` when a task needs a format constraint. Schemas containing `$schema`, `format`, asynchronous validation, or anything else the bridge cannot compile are rejected before a Work task starts.

The bridge does not restart the Work runtime after an unexpected runtime error or exit. Existing task state remains available for inspection, but health and new task requests return `503` until the bridge process is restarted with `pnpm dev:work`. A bounded tail of runtime stderr is written to the bridge log on failure and is not exposed through task or health responses.
