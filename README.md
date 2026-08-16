# Job Search Facilitator

> A local full-stack app that turns AI-sourced job leads into a focused review, application, outreach, and tracking pipeline.

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=fff)](https://www.typescriptlang.org/docs/)
[![Vue.js](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)](https://vuejs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/docs/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![Codex](https://img.shields.io/badge/Codex-000000?style=for-the-badge&logo=openai&logoColor=white)](https://developers.openai.com/codex/)

## Overview

Job Search Facilitator is a Vue application with Review, Apply, and Track workspaces.

Review combines dated search reports and user-added roles. It shows fit evidence, job facts, and priority labels.

Apply turns labeled roles into a working queue. It stores application files, status changes, and outreach contacts.

Track summarizes active applications, closed outcomes, pending replies, and follow-up dates.

An Express API stores workflow data in PostgreSQL through Prisma. Shared Zod schemas validate data across each workspace package.

A host-side bridge connects the client to Codex and Chrome. It runs structured, read-only research tasks with browser approval prompts.

## Architecture & Key Features

### Client Side

#### Review Workspace

- **Search reports:** Browse dated reports, ranked recommendations, job descriptions, and source links.
- **User labels:** Mark roles as `P1`, `P2`, `quick-app`, or `forgo`.
- **Job import:** Submit one job URL for Codex to inspect and return as structured data.
- **Saved state:** Restore filters, selections, and active Agent tasks after navigation or reloads.

#### Apply Workspace

- **Application queue:** Show labeled roles that have not reached an applied state.
- **Application files:** Store a resume, cover letter, and application-page capture for each role.
- **Application status:** Move roles through applied, interviewing, rejected, and hired states.
- **Outreach:** Discover relevant contacts, edit message drafts, and record sent messages or responses.

#### Track Workspace

- **Pipeline filters:** View open, active, closed, awaiting-reply, and responded roles.
- **Activity timeline:** Combine application changes and outreach events for each role.
- **Follow-up list:** Surface due application and outreach follow-ups.
- **Responsive panels:** Adapt list, detail, description, and outreach panels across screen sizes.

### Server Side

#### API and Data Model

- **Routes:** Express exposes job posts, reports, artifacts, outreach, and update-check endpoints.
- **Database:** Prisma targets PostgreSQL for reports, posts, snapshots, files, contacts, runs, and activities.
- **Identity checks:** Source keys and canonical URLs prevent duplicate job records.
- **Validation:** Zod validates request bodies, route values, and responses shared with the client.
- **Safety:** Helmet, CORS restrictions, request limits, and local database guards protect development workflows.

#### Job Search Artifacts

- **Bounded input:** The artifact CLI rejects oversized, malformed, or invalid job-search data.
- **History checks:** Existing post identities prevent duplicate recommendations across reports.
- **Review handoff:** Candidate pools, judgments, and selections use validated JSON contracts.
- **Report output:** The CLI creates API payloads and verifies rendered Markdown reports.

### Agent Bridge

- **Local adapter:** The bridge starts the bundled Codex app-server on the host Mac.
- **Chrome capability:** Codex can inspect job posts and LinkedIn pages through the installed Chrome plugin.
- **Structured output:** JSON Schema contracts validate job imports, contact results, and draft revisions.
- **Live progress:** Server-sent events stream task status, results, failures, and permission requests.
- **Read-only runtime:** Agent tasks use a read-only sandbox with no shell approval escalation.
- **Task lifetime:** Task state remains in memory until the bridge process stops.

## Tech Stack

**Client:**

- **Framework:** Vue 3, Vue Router 5, Vite 8
- **State Management:** Pinia
- **Language:** TypeScript
- **Styles:** SCSS
- **Testing:** Vitest, Vue Test Utils, Playwright

**Server:**

- **Runtime:** Node.js 24, Express 5
- **Database:** PostgreSQL 16, Prisma ORM
- **Validation:** Zod
- **Security:** Helmet, CORS, bounded request bodies
- **Testing:** Vitest, Supertest, Node test runner

**Agent Bridge:**

- **Runtime:** Codex app-server bundled with the ChatGPT Mac app
- **Browser:** Codex Chrome capability
- **Transport:** Express and server-sent events
- **Validation:** AJV and Zod

**Workspace:**

- **Package Manager:** pnpm workspaces
- **Shared Package:** `@job-search-facilitator/core`

## Running Locally

Install Node.js 24, pnpm 11, and Docker. Agent features also need macOS, ChatGPT, and the Codex Chrome plugin.

Install dependencies:

```bash
corepack enable
pnpm install
```

Default local ports and database credentials need no `.env` files. Use each package's `.env.example` for custom values.

Start PostgreSQL, deploy migrations, and add sample data:

```bash
pnpm run dev:db:seed
```

Start the web app and Agent bridge in separate terminals:

```bash
pnpm run dev
pnpm run dev:agent
```

The client uses port `5173`. The API uses port `3000`. The Agent bridge uses port `3001`.

Agent tasks expect private guidance in `docs/agents/job-search`. The repository ignores this local directory.

Build every application package:

```bash
pnpm run build
```

Run formatting, linting, type checks, tests, and builds:

```bash
pnpm run check
```

Database integration tests require `TEST_DATABASE_URL`. Its database name must end with `_test`.

```bash
TEST_DATABASE_URL=postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator_test pnpm run test:integration
```

Stop or reset the local database:

```bash
pnpm run dev:db:stop
pnpm run dev:db:reset
```

Remove the local database volume after creating a backup:

```bash
pnpm run dev:db:clean
```
