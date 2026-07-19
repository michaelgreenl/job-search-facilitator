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

- `GET /health` reports the capabilities discovered from ChatGPT Work.
- `POST /tasks` starts a structured task.
- `GET /tasks/:id` returns its current state.
- `POST /tasks/:id/cancel` interrupts a running task.
- `GET /tasks/:id/events` streams user-safe progress with server-sent events.

Task events and output are held in memory for the life of the bridge process. Durable workflow state belongs in the Docker API. The bridge is intentionally bound to loopback and starts Work tasks with a read-only sandbox and no approval escalation.
