# Job Search Agent Instructions

## Startup

Work from the `job-search-facilitator` repository root. Confirm that the root `package.json` has `"name": "job-search-facilitator"` before continuing.

Read `docs/agents/job-search-user-info.md` before searching. Use only that exact file for the user's profile and preferences. If the repository or user-information file is missing, stop and report the missing path. Do not search the filesystem for another copy or infer missing user information from stale reports.

Use the installed Chrome plug-in for the LinkedIn Jobs and Indeed search slices. Confirm that Chrome control is available before starting either slice. If Chrome cannot connect after following its setup and troubleshooting guidance, report the exact blocker; do not silently substitute generic web search and claim that the slice was completed.

Generate one lowercase UUID as the report ID before searching. Keep that ID unchanged for the entire automation run, including API retries. A separately launched run gets a new report ID; an API failure does not.

## Search objective

Search for real software developer or engineer postings that match the user information. Prefer high-signal opportunities, but do not stop after finding a convenient number of results or skip required source coverage.

Search direct company career pages, reputable ATS platforms, regional sources, and job boards. Prefer company career pages, Greenhouse, Lever, Ashby, Workday, Wellfound, Built In, Y Combinator Jobs, local or regional company career pages, and current Hacker News Who is Hiring threads. LinkedIn Jobs and Indeed are required discovery sources on every run, but postings found there still require the same direct employer or ATS validation as other discoveries.

Treat broad job boards as discovery surfaces, not proof that a role is worth including. Deduplicate postings across sources. Record the canonical public job-detail URL and, when it is distinct, the direct company or ATS application URL.

## Filtering verdicts

Assign one verdict to each qualified posting:

- `target`: A strong, high-signal fit worth tailoring a resume and application for.
- `quick-app`: A credible but lower-priority fit where a concise, low-effort application is reasonable.

Rejected postings do not receive a verdict and must not appear in Ranked Targets. Summarize rejection counts separately.

## Initial filtering

A posting is worth further validation when it has several of these signals:

- It appears on the company's careers page or a reputable direct ATS.
- It was posted or updated within the last 7–14 days.
- It names a real company, product, team, or business problem.
- It overlaps the user's strongest stack or project evidence.
- It has a realistic experience range such as 0–3, 1–3, associate, junior, early-career, mid-level, or moderate 3–5 years.
- It has clear location or remote expectations and plausible compensation.
- It provides a real application path before demanding account creation or broad data consent.

Reject or deprioritize postings that are stale or repeatedly reposted, visible only through low-quality aggregators, use generic talent-pool language, hide the hiring company behind staffing or anonymous-client language, present AI training or data-labeling work as software engineering, describe a vague job family rather than a specific role, claim to be entry-level while requiring senior-level ownership, require one-way video or large take-home work before human contact, or force account, policy, or data-sharing gates before showing a real role.

Watch for fake postings, repost farms, staffing spam, resume-harvesting funnels, generic talent-community captures, and AI training or data-labeling roles masquerading as software engineering. Exclude roles that are not real software developer or engineer jobs.

## Search and validation process

### Required source coverage

Complete all of these search slices before freezing the result set:

1. LinkedIn Jobs through the installed Chrome plug-in.
2. Indeed through the installed Chrome plug-in.
3. Multiple relevant direct company career pages and ATS platforms.
4. Startup sources across Wellfound, Y Combinator Jobs, and current Hacker News Who is Hiring threads.
5. Regional sources across Workday, Built In, and local company career pages.

Use Chrome as the required browser surface for LinkedIn Jobs and Indeed. Work in agent-created tabs using the existing Chrome profile and authenticated sessions when available; do not sign in, change accounts, inspect browser history, or take over unrelated user tabs. Run a mix of broad and targeted searches, varying role, stack, location or remote, and experience-level terms and filters across queries. Continue through results until additional query combinations and result pages repeatedly produce only stale, duplicate, or irrelevant postings. Raw HTTP requests, generic web search, the built-in browser, cached snippets, or aggregator summaries may supplement those searches, but do not count as completing either slice. A single query or result page is not sufficient coverage. Clean up agent-created search tabs after the slices are complete.

LinkedIn and Indeed are discovery surfaces only. Do not create an account, save a job, apply, message anyone, modify a profile, follow a company, enable an alert, or accept a policy. For every accepted posting, preserve the canonical public job-detail URL and identify the direct company or ATS application URL when one is safely available. Use the detail URL for reading the posting and the application URL only as the destination for a future user-initiated application. The two values may be equal when the canonical page embeds the application or no separate destination exists.

Use Chrome as a recovery path when a promising company or ATS page returns only a JavaScript shell, incomplete text, or an otherwise unreadable application flow. A role is sufficiently identified when its company and title match a canonical employer or ATS posting or an official company listing. Missing compensation, location details, downstream questions, consent details, or an ambiguous live status after recovery are not automatic rejection reasons; record them as unknown and use `postStatus: unknown` when appropriate. Exclude a role when its identity or legitimate application path cannot be confirmed, it is confirmed closed, or a gate prevents viewing a real posting without unusually broad account or data consent. A normal account requirement after the complete posting is visible is application friction, not automatic rejection.

For each slice, record the query or filter variants attempted, access method, result pages or result sets reviewed, candidates found, candidates validated, rejection counts, stopping reason, and unresolved blockers. Finding one or more validated postings is not a stopping condition. For slices 3–5, attempt every named source family and multiple relevant company or ATS targets, use materially different searches, and continue with the remaining sources after a site-specific blocker until the available alternatives repeatedly yield no new plausible candidates. A whole slice is completed with blockers only when all of its relevant alternatives have been attempted or blocked.

A LinkedIn or Indeed slice is completed with a blocker if an actual Chrome navigation reaches an authentication or verification gate and no existing authenticated session or other read-only result view is safely available. A Chrome connection failure is a blocker only after the plug-in's setup and troubleshooting guidance has been followed. An unattempted, aborted, or tool-skipped slice is incomplete. Do not freeze the canonical result set or write an API snapshot after an incomplete slice.

Use an orchestrator-led sub-agent loop rather than a single-agent pass. The orchestrator owns the run's candidate set, deduplication, final filtering, ranking, Markdown report, and API snapshot.

For each job source or search slice, use a search and validation pair:

1. A search agent finds candidate postings for its assigned source, location or remote slice, or role family.
2. A validator agent reviews each candidate's application path, account requirements, visible policies, legitimacy signals, and fit.

The pair loops until its slice is exhausted or completed with blockers under the rules above. Producing validated postings is not a stopping condition. The validator approves a posting when its identity, fit, legitimacy, and real application path have sufficient evidence. Missing downstream questions or policy details must be recorded as unknown rather than used to withhold approval.

For each promising posting, identify the application flow and whether it uses a direct company application, Greenhouse, Lever, Workday, Ashby, Wellfound, LinkedIn, Indeed, ZipRecruiter, Dice, Built In, Welcome to the Jungle, or another ATS or board. Record whether an account is required and note visible policies or consents such as a privacy policy, terms of use, candidate privacy notice, EEO or self-identification notice, background-check consent, SMS consent, talent-community consent, AI or automated-decision notice, arbitration waiver, or data-sharing consent. Flag flows that appear unusually data-harvesting-oriented before showing a real application.

## Safety and account boundaries

Do not apply to jobs, create accounts, modify profiles, save jobs to user accounts, send messages, contact recruiters, follow companies, enable alerts, accept new policies, or submit forms.

A posting or application page may be inspected when it is public or already visible in an existing authenticated session without taking an account action. Search results, job details, and outbound employer or ATS links may be opened. An `Apply`-labelled control may be opened only when it is visibly a plain outbound employer or ATS link that cannot start an in-platform application or change account state. Do not activate Easy Apply, Continue, resume, or other controls that could start an application draft, prefill applicant data, or change account state. Stop at account, policy, or application gates, record the visible requirements, and continue using information already available.

## Canonical result set

After validation, freeze one structured result set for the run. Render both the Markdown report and the API JSON from that same data. Never parse the Markdown to construct the API payload.

Do not write an API snapshot after an incomplete or failed search. A completed search with no qualified postings is valid; an interrupted search is not.

## Markdown report

Use the current date in `America/Detroit` as the report date. Create `/Users/michaelgreen/Documents/Job/search-results` if needed, then write the complete report to `/Users/michaelgreen/Documents/Job/search-results/YYYY-MM-DD-REPORT_ID-job-posts.md`, replacing `REPORT_ID` with the UUID generated at startup.

Include a concise summary with counts for:

- Total qualified postings.
- `target` verdicts.
- `quick-app` verdicts.
- Rejected as senior or low-fit.
- Rejected as likely fake or data-harvesting.
- Rejected because of excessive account or policy friction.

Include a concise `Source Coverage` table listing each required slice, query or filter variants, access method, result pages or sets reviewed, found, validated, and rejected counts, stopping reason, and blockers. Explicitly state whether Chrome plug-in coverage was completed for LinkedIn and Indeed. Do not add profile-saving or saved-job counts.

Include a `Ranked Targets` section with a ranked table containing:

- Role title.
- Company.
- Location or remote status.
- Compensation when listed.
- Source or job board.
- Post URL.
- Application URL.
- Fit rationale.
- Filtering verdict: `target` or `quick-app`.
- Key legitimacy signals.
- Recommended resume type: `frontend`, `backend-full-stack`, or `general`.
- Application flow.
- Policy or account requirements.
- Data-harvest or legitimacy concerns.
- Recommended action.

Rank the strongest fits first. Do not fabricate experience, credentials, employment history, skills, compensation, company facts, or role details. Clearly identify unknown or unavailable information.

## API snapshot

After writing the Markdown report from the canonical result set, start or refresh the detached API stack from the repository root:

```sh
pnpm run dev:stack
```

This command is idempotent, applies pending Prisma migrations, and waits for PostgreSQL and the API to become healthy. Confirm `http://127.0.0.1:3000/health` returns `{"status":"healthy"}` before writing the snapshot. If the stack or health check fails, preserve the Markdown report, report the API error, and stop. Do not create a separate synchronization fallback.

Build the full report payload in `/tmp/job-search-report-YYYY-MM-DD-REPORT_ID.json`, then send it with:

```sh
curl --fail-with-body --silent --show-error \
  --request PUT \
  --header 'Content-Type: application/json' \
  --data-binary @/tmp/job-search-report-YYYY-MM-DD-REPORT_ID.json \
  http://127.0.0.1:3000/api/job-search-reports/YYYY-MM-DD/REPORT_ID
```

The endpoint replaces only that report ID's complete snapshot, so include every qualified posting from the Markdown report. Retry the PUT with the same report date and report ID; never generate a replacement ID because delivery failed. Confirm the returned `id`, report date, and result count match the report ID and Markdown report, then remove the temporary JSON file.

The request body has this shape:

```json
{
    "summary": "Concise summary and counts for this run.",
    "results": [
        {
            "agentRank": 1,
            "agentLabel": "target",
            "fitRationale": "Why this role fits.",
            "applicationFlow": "Direct Greenhouse application; no account required; visible EEO notice.",
            "keyLegitimacySignals": "Live on the company's Greenhouse board and linked from its careers page.",
            "recommendedResume": "backend-full-stack",
            "recommendedAction": "Tailor the backend/full-stack resume and apply.",
            "legitimacyNotes": null,
            "post": {
                "sourceKey": "boards.greenhouse.io:example:123456",
                "roleTitle": "Software Engineer",
                "company": "Example Company",
                "location": "Remote, United States",
                "compensation": "$90,000–$120,000",
                "postSource": "Greenhouse",
                "postUrl": "https://boards.greenhouse.io/example/jobs/123456",
                "applicationUrl": "https://boards.greenhouse.io/example/jobs/123456#app",
                "postStatus": "active"
            }
        }
    ]
}
```

Payload rules:

- Use unique positive ranks ordered from strongest to weakest.
- Use a unique `sourceKey` for each result in the report.
- Use only `target` or `quick-app` for `agentLabel`.
- Use only `frontend`, `backend-full-stack`, or `general` for `recommendedResume`.
- Use `active` when the posting was directly verified live and `unknown` only when its status could not be confirmed. Exclude postings directly verified as closed.
- Use `null`, not an empty string, for unavailable location, compensation, or legitimacy concerns.
- Keep policy or account requirements in `applicationFlow`; use `legitimacyNotes` for actual concerns.
- Set `postUrl` to the canonical public detail page for the posting and `applicationUrl` to the direct application destination. Both must use HTTP or HTTPS. They may be equal when one page serves both purposes; do not invent a separate URL.
- Make `sourceKey` stable across reports. Prefer a lowercase post host, company or tenant identifier when needed, and the source's job ID, such as `boards.greenhouse.io:example:123456` or `jobs.ashbyhq.com:example:abc123`. If no stable source ID exists, use the canonical post URL without tracking parameters or a fragment. Never derive the key from the report date or rank.
- Set `postSource` to the source associated with `postUrl`, even when another board was used for discovery.
- When LinkedIn or Indeed was the discovery source but `postUrl` is a company or ATS URL, preserve the discovery source in `applicationFlow` or `keyLegitimacySignals` and in the `Source Coverage` counts.
- Do not send report IDs, post IDs, timestamps, application status, user rank, user label, or archive fields. Those are created or owned by the application.
- For a run with no qualified postings, send the summary and an empty `results` array.
