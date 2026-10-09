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

### Resume library

Open Settings with the gear icon. Add a named master resume as a PDF. Use **Upload new PDF** to update that resume.
The newest upload becomes current. **View previous uploads** opens timestamped history with open and download links.
The app stores all PDFs in PostgreSQL. Database backups include upload history. These files remain separate from application-specific documents.

Install Poppler on the machine that runs the Agent bridge and scheduled search (`brew install poppler` on macOS).
The reader requires `pdftotext` on `PATH`. Use unlocked PDFs with selectable text; scanned images need text recognition before upload.

After the API starts, run `pnpm run job-search:resumes` to check extraction without running a search.
This command prints private resume text. Do not publish its output.
Use `JOB_SEARCH_API_URL` when the API does not use `http://127.0.0.1:3000/api`.

The standard `job-search:run` command keeps the private resume-selection policy. It does not read the uploaded resume library.
To test the library, keep the API running and use `pnpm run job-search:run --resume-library` in a duplicate automation.
Only that command loads the current PDFs on the launcher host, before starting the sandboxed agents.
Use `--resume-library --check` to verify extraction and runtime setup without starting a search.
Set a separate `JOB_SEARCH_CODEX_HOME` for the duplicate's runtime state. It still shares the local application and report storage.
User-added imports receive the extracted PDF context automatically.
The current library replaces fixed resume categories. Agents recommend a starting resume without giving tailoring suggestions or requiring perfect wording.
An empty library keeps the existing choices. Extraction or library errors stop evaluation instead of silently omitting uploaded context.

Deploy the API migration, Agent bridge, and client together. The runner still supports an older API during rollout.
Keep the original saved schedule and private policy files unchanged. Only the duplicate should include `--resume-library` during testing.

### Manual run

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

### Manage local schedules in Settings

Settings lists local desktop automations associated with this project. Keep the Agent bridge running to load or change them.
Each row shows its active or paused state, schedule, computer time zone, and next scheduled time.
Use **Pause** or **Resume** to change its state. Pausing prevents future scheduled runs; it does not cancel a run already in progress.

Use **Edit schedule** to choose run days and times, then select **Save schedule**. Use **Add time** for another run on each selected day. Saving keeps the current active or paused state.
The editor supports daily and weekly schedules with up to 24 run times on each selected day. Edit other recurrence patterns in the desktop app.
Use **Refresh** after changing a schedule elsewhere. Conflicting edits require a refresh before saving.

These controls update the existing local schedule files in the desktop user's Codex home. They preserve the prompt, model, and other configuration.
They do not create schedules or manage cloud schedules. Keep the computer awake and the desktop app open for scheduled runs.

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
