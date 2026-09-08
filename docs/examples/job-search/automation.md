[@chrome](plugin://chrome@openai-bundled)

# Scheduled job search

Run the complete job-search workflow from `[PROJECT_ROOT]`. Use no other checkout.

Create one report in `[REPORT_DIRECTORY]`. Sync the same report to the local application.

Read these files completely in this order:

1. `docs/agents/job-search/user-info.md`
2. `docs/agents/job-search/post-evaluation.md`
3. `docs/agents/job-search/strategy.md`
4. `docs/agents/job-search/navigation.md`
5. `docs/agents/job-search/reporting.md`

These files and the application validators are the complete policy. Do not use old reports or task memory as policy.

## Preflight

Use the current date in `America/Detroit` as `REPORT_DATE`. Generate one lowercase UUID as `REPORT_ID`.

Create a private temporary directory for all JSON artifacts. Set `REPORT_PATH` to:

`[REPORT_DIRECTORY]/REPORT_DATE-REPORT_ID-job-posts.md`

Perform every startup check in `navigation.md`. Stop and report an exact failure when a check does not pass.

Fetch history without printing its body:

```bash
curl --fail-with-body --silent --show-error --output JOB_POSTS_RESPONSE_PATH \
  'http://127.0.0.1:3000/api/job-posts'
pnpm run job-search:artifact -- history JOB_POSTS_RESPONSE_PATH EXISTING_IDENTITIES_PATH FEEDBACK_PATH
```

Do not use compact feedback for discovery or judgment. It exists only for command compatibility.

## Discovery

Complete the source coverage in `navigation.md`. Search responsibilities and realistic level, not exact titles alone.

A candidate needs all these properties:

- It is active and net-new.
- It has a current employer or reputable ATS page.
- It has a public direct application route.
- Its complete description is readable.
- It has no objective rejection from `post-evaluation.md`.

Write each candidate with the exact shape in `navigation.md`. Validate it immediately:

```bash
pnpm run job-search:artifact -- candidate CANDIDATE_PATH
```

Correct only source extraction or schema errors. Do not invent a fact or weaken policy.

Combine all validated candidates into one JSON array at `MERGED_CANDIDATES_PATH`. Keep discovery order.

Write all five lane records to `COVERAGE_PATH`. Preserve blockers and every completed query.

Remove stored identities and current-run duplicates. Create the review packet:

```bash
pnpm run job-search:artifact -- pool MERGED_CANDIDATES_PATH EXISTING_IDENTITIES_PATH CANDIDATES_PATH REVIEW_PATH
pnpm run job-search:artifact -- coverage COVERAGE_PATH CANDIDATES_PATH
```

Stop if either command fails. Do not edit valid evidence to make a check pass.

## Judgment

Evaluate every candidate in `REVIEW_PATH` once. Use only the current profile, evaluation policy, strategy, and review packet.

Write `JUDGMENT_PATH` with the unchanged `reviewDigest`. Put selected decisions first in rank order.

Put rejected decisions after selections in original candidate order. Include each `sourceKey` exactly once.

Use this shape for selected roles:

```json
{
    "sourceKey": "candidate sourceKey",
    "verdict": "target",
    "fitRationale": "specific evidence and material gaps",
    "recommendedResume": "exact current resume version name",
    "recommendedAction": "truthful application guidance"
}
```

`verdict` can be `target` or `quick-app`. `recommendedResume` must match a resume version in `user-info.md`.

Use this shape for rejected roles:

```json
{
    "sourceKey": "candidate sourceKey",
    "verdict": "reject",
    "rejectionReason": "specific failed rule and source evidence"
}
```

Validate the exhaustive judgment and create the selection:

```bash
pnpm run job-search:artifact -- judgment REVIEW_PATH JUDGMENT_PATH SELECTION_PATH
```

An empty selection is valid. Never add a weak role to increase the result count.

## Delivery

Follow `reporting.md` exactly. Use the paths and report values from this run.

Report only these results:

- The report path and ID.
- Candidate, excluded, target, quick-app, and rejection counts.
- Completed and blocked source lanes.
- PUT, GET, storage, and Markdown verification results.

Never apply, upload files, submit forms, save jobs, change profiles, or contact anyone.
