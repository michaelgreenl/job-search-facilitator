# Job Search Facilitator

> A local full-stack app that turns AI-sourced job leads into a focused review, application, outreach, and tracking pipeline.

[![Codex](https://custom-icon-badges.demolab.com/badge/Codex-000000?style=for-the-badge&logo=openai&logoColor=white)](https://developers.openai.com/codex/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=fff)](https://www.typescriptlang.org/docs/)
[![Vue.js](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)](https://vuejs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/docs/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)

## Links

- **💼 [Portfolio Link](https://michaelgreenl.net/#projects?slug=jsf&autoplay=false)**
- **🎥 [Demo Video](https://michaelgreenl.net/#projects?slug=jsf&autoplay=true)**

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

### Prerequisites

Install these tools for the complete application:

- Node.js 24
- pnpm 11 through Corepack
- Docker Desktop with Docker Compose
- macOS with the [ChatGPT desktop app](https://learn.chatgpt.com/docs/app)
- Google Chrome

The web app and API can run without the Agent bridge. Job imports and contact discovery need the complete setup.

### Install the application

Clone the repository and enter its directory:

```bash
git clone https://github.com/michaelgreenl/job-search-facilitator.git
cd job-search-facilitator
```

Install dependencies:

```bash
corepack enable
pnpm install
```

Default local ports and database credentials need no `.env` files. Use each package's `.env.example` for custom values.

### Configure Codex and Chrome

Sign in to the ChatGPT desktop app. Open **Plugins**, then install and enable **Chrome**.

Complete the extension setup in Chrome. Approve its permissions and confirm that the ChatGPT side panel loads.

See OpenAI's [Chrome extension setup](https://learn.chatgpt.com/docs/chrome-extension) for current instructions and security details.

The app keeps applicant facts and automation policy outside Git. Copy the public templates into the ignored private directory:

```bash
mkdir -p docs/agents/job-search docs/agents/update-check
cp -n docs/examples/job-search/*.md docs/agents/job-search/
cp -n docs/examples/update-check/*.md docs/agents/update-check/
git -C docs/agents init
```

Edit `docs/agents/job-search/user-info.md`. Replace each `[REQUIRED]` value with verified applicant information.

Use the tracked [profile example](docs/examples/job-search/user-info.md) to review the required sections.

Edit `docs/agents/job-search/post-evaluation.md` when the default evaluation rules do not match your search.

The repository ignores `docs/agents`. Do not copy personal information back into `docs/examples`.

Keep both files at these exact paths. Job import stops when either file is unavailable.

Two scheduled automations complete the workflow:

- Job search discovers and syncs new roles.
- The application tracker checks Gmail and LinkedIn for application and outreach updates.

Complete the [automation setup guide](docs/automation-setup.md). The guide includes both prompts and an end-to-end check.

### Start the application

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

Open [http://localhost:5173](http://localhost:5173) after both commands start.

### Verify the setup

Check the API and Agent bridge in another terminal:

```bash
curl --fail http://localhost:3000/health
curl --fail http://127.0.0.1:3001/health
```

The API response must include `"status":"healthy"`. The Agent response must also include `"chrome"` in `capabilities`.

Open the Review workspace and select **Add job post**. Submit a public job-post URL to test the complete Agent flow.

The task can ask for access to each website it visits. Review each website before you allow access.

### Troubleshooting

- If Chrome is missing, confirm that the Chrome plugin is on in ChatGPT.
- Confirm that the ChatGPT side panel loads in the active Chrome profile.
- Restart Chrome, ChatGPT, and `pnpm run dev:agent` after a plugin change.
- If the bridge cannot find Codex, set `CODEX_BIN` in `packages/app/agent-bridge/.env`.
- If an Agent cannot read the profile, start the bridge from the repository root.
- If a port differs, copy the applicable `.env.example` file and update its values.

The application does not create or edit ChatGPT tasks or plugin settings. Configure both scheduled tasks in ChatGPT when you want the automated workflow.

### Development commands

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
