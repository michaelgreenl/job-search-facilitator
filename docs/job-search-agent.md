# Job Search Agent Instructions

## Startup

Work from the `job-search-facilitator` repository root. Confirm that the root `package.json` has `"name": "job-search-facilitator"` before continuing.

Read `docs/job-search-user-info.md` before searching. Use only that exact file for the user's profile and preferences. If the repository or user-information file is missing, stop and report the missing path. Do not search the filesystem for another copy or infer missing user information from stale reports.

## Search objective

Search for real software developer or engineer postings that match the user information. Prefer a smaller number of high-signal opportunities over broad coverage of low-signal listings.

Search direct company career pages, reputable ATS platforms, regional sources, and job boards. Prefer company career pages, Greenhouse, Lever, Ashby, Workday, Wellfound, Built In, Y Combinator Jobs, local or regional company career pages, and current Hacker News Who is Hiring threads. LinkedIn and Indeed may be used as discovery sources, but neither is mandatory or receives special treatment.

Treat broad job boards as discovery surfaces, not proof that a role is worth including. Deduplicate postings across sources and prefer a direct company or ATS application URL when available.

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

Use an orchestrator-led sub-agent loop rather than a single-agent pass. The orchestrator owns the daily candidate set, deduplication, final filtering, ranking, Markdown report, and API snapshot.

For each job source or search slice, use a search and validation pair:

1. A search agent finds candidate postings for its assigned source, location or remote slice, or role family.
2. A validator agent reviews each candidate's application path, account requirements, visible policies, legitimacy signals, and fit.

The pair loops until its slice has produced validated postings or has been exhausted. The orchestrator accepts a posting only after validator approval.

For each promising posting, identify the application flow and whether it uses a direct company application, Greenhouse, Lever, Workday, Ashby, Wellfound, LinkedIn, Indeed, ZipRecruiter, Dice, Built In, Welcome to the Jungle, or another ATS or board. Record whether an account is required and note visible policies or consents such as a privacy policy, terms of use, candidate privacy notice, EEO or self-identification notice, background-check consent, SMS consent, talent-community consent, AI or automated-decision notice, arbitration waiver, or data-sharing consent. Flag flows that appear unusually data-harvesting-oriented before showing a real application.

## Safety and account boundaries

Do not apply to jobs, create accounts, modify profiles, save jobs to user accounts, send messages, contact recruiters, follow companies, enable alerts, accept new policies, or submit forms.

A public posting or application page may be inspected only when reachable without taking one of those actions. Stop at account, policy, or application gates. Record the visible requirements and continue using information already available.

## Canonical result set

After validation, freeze one structured result set for the run. Render both the Markdown report and the API JSON from that same data. Never parse the Markdown to construct the API payload.

Do not replace an existing API snapshot after an incomplete or failed search. A completed search with no qualified postings is valid; an interrupted search is not.

## Markdown report

Use the current date in `America/Detroit` as the report date. Create `/Users/michaelgreen/Documents/Job/search-results` if needed, then write the complete report to `/Users/michaelgreen/Documents/Job/search-results/YYYY-MM-DD-job-posts.md`.

Include a concise summary with counts for:

- Total qualified postings.
- `target` verdicts.
- `quick-app` verdicts.
- Rejected as senior or low-fit.
- Rejected as likely fake or data-harvesting.
- Rejected because of excessive account or policy friction.

Include a `Ranked Targets` section with a ranked table containing:

- Role title.
- Company.
- Location or remote status.
- Compensation when listed.
- Source or job board.
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

Build the full report payload in `/tmp/job-search-report-YYYY-MM-DD.json`, then send it with:

```sh
curl --fail-with-body --silent --show-error \
  --request PUT \
  --header 'Content-Type: application/json' \
  --data-binary @/tmp/job-search-report-YYYY-MM-DD.json \
  http://127.0.0.1:3000/api/job-search-reports/YYYY-MM-DD
```

The endpoint replaces that date's complete snapshot, so include every qualified posting from the Markdown report. A repeated PUT for the same date is expected and must use the same stable post keys. Confirm the returned report date and result count match the Markdown report, then remove the temporary JSON file.

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
                "applicationUrl": "https://boards.greenhouse.io/example/jobs/123456",
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
- Make `sourceKey` stable across reports. Prefer a lowercase application host, company or tenant identifier when needed, and the source's job ID, such as `boards.greenhouse.io:example:123456` or `jobs.ashbyhq.com:example:abc123`. If no stable source ID exists, use the canonical application URL without tracking parameters or a fragment. Never derive the key from the report date or rank.
- Set `postSource` to the source associated with the preferred application URL, even when another board was used for discovery.
- Do not send report IDs, post IDs, timestamps, application status, user rank, user label, or archive fields. Those are created or owned by the application.
- For a run with no qualified postings, send the summary and an empty `results` array.
