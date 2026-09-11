# Automation Setup

This guide configures the two scheduled tasks that complete the project workflow.

- Job search finds, evaluates, reports, and syncs new roles.
- The application tracker checks application decisions and outreach replies.

The web app works without these tasks. The full automated workflow needs both tasks.

## Before you start

Complete the main [local setup](../README.md#running-locally). Confirm these results:

- The API health check returns `"status":"healthy"`.
- The Agent bridge health check lists `chrome` in `capabilities`.
- The Review workspace can import one public job URL.

Sign in to Gmail, LinkedIn, Indeed, and VueJobs in the Chrome profile connected to ChatGPT. The tasks use those existing sessions.

## Create private automation files

Run these commands from the project root:

```bash
mkdir -p docs/agents/job-search docs/agents/update-check
cp -n docs/examples/job-search/*.md docs/agents/job-search/
cp -n docs/examples/update-check/*.md docs/agents/update-check/
git -C docs/agents init
```

These commands are safe to repeat. `cp -n` preserves an existing private file.

The parent repository ignores `docs/agents`. The nested repository keeps private policy changes reviewable on your computer.

Edit `docs/agents/job-search/user-info.md`. Replace every `[REQUIRED]` value with verified applicant facts.

Review `docs/agents/job-search/post-evaluation.md` and `strategy.md`. Change limits and search priorities for your needs.

Replace `[PROJECT_ROOT]` in all copied files with the absolute project path. Replace `[REPORT_DIRECTORY]` in the job-search prompt.

Check for unfinished values:

```bash
rg -n '\[(PROJECT_ROOT|REPORT_DIRECTORY|REQUIRED)' docs/agents
```

Create the report directory. Then commit the private configuration:

```bash
git -C docs/agents add .
git -C docs/agents commit -m "chore: configure local automations"
```

Do not add a remote to this nested repository. It can contain personal information.

## Test each prompt manually

Open the project folder in the ChatGPT desktop app. Use the local project, not an isolated worktree.

Run `pnpm run job-search:run --check` from the project root. Then run `pnpm run job-search:run` and review its result.

The job-search runner uses a separate Codex home. It excludes personal `AGENTS.md` files and skills. It reads the current private workflow from `docs/agents/job-search/automation.md`.

Confirm that the run creates a Markdown report. Confirm that the same report appears in Review.

Label one role `P1`, `P2`, or `quick-app`. Confirm that it appears in Apply.

Use Apply to upload application files. Discover an outreach contact if needed. Submit the application yourself, then select **Mark applied**.

Paste `docs/agents/update-check/automation.md` into another new chat. Run it once after an application or outreach message has a real update.

Confirm that Track shows the saved status or response. A run with no active work must finish without opening Gmail or LinkedIn.

## Schedule both tasks

Create standalone scheduled tasks in the ChatGPT desktop app. Select this local project for each task.

Configure the saved prompts:

1. For job search, instruct the task to run `pnpm run job-search:run` from the project root outside the sandbox. It must wait for completion and report the command's result. It must not read policy or applicant files, browse, or repeat the workflow itself. Use the Node 24 launcher required by your local setup. Set `JOB_SEARCH_MODEL` and `JOB_SEARCH_REASONING_EFFORT` on the command when the schedule uses different model settings.
2. For update check, use the full contents of `update-check/automation.md`. Schedule it after job search or at another regular time.

The desktop launcher still receives desktop instructions. The job-search coordinator and workers run in the isolated home. The update-check setup above still uses the desktop context.

Keep the computer on and the ChatGPT desktop app open when a task needs local files. Review the first few runs before you trust the schedule.

See OpenAI's [scheduled tasks guide](https://learn.chatgpt.com/docs/automations) for current controls.

## Full workflow check

Use this sequence after setup:

1. Run job search and confirm the report in Review.
2. Apply a user label and confirm the role in Apply.
3. Save the resume, cover letter, and application-page capture.
4. Submit the external application and select **Mark applied**.
5. Record sent outreach when you contact someone.
6. Run update check after a real email or LinkedIn response exists.
7. Confirm the event and timeline in Track.

The automation never submits applications or sends messages. Those actions always remain with the user.

## Common failures

- A task cannot find policy files: select the local project and verify `[PROJECT_ROOT]`.
- A task starts in a worktree: change it to the local project. Ignored private files do not follow worktrees.
- Gmail, LinkedIn, Indeed, or VueJobs is blocked: open the site in connected Chrome and finish sign-in.
- Local API access fails: allow the task to run Docker and local requests when ChatGPT asks.
- Docker already serves port 3000: use `pnpm run dev:client` instead of `pnpm run dev`.
- A search cannot sync: confirm `/health` includes `jobSearchNetNewGuard: 1`.
- An update does not leave context: review-needed events can remain active by design.
