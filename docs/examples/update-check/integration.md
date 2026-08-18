# Update Check Integration and Safety

## Startup

Use `[PROJECT_ROOT]` as the only application checkout.

Confirm these properties:

- It is the Git root.
- Its package name is `job-search-facilitator`.
- Every file in `docs/agents/update-check` is readable.
- `docs/agents` is a separate Git repository with no remote.
- The parent repository ignores `docs/agents`.

Check `http://127.0.0.1:3000/health`. Reuse the API when it returns `"status":"healthy"`.

If the API is unavailable, run `pnpm run dev:stack` once. Check health again and stop if it remains unavailable.

Use host permission for Docker and localhost requests when required.

## Application API

Fetch the current work set:

```text
GET http://127.0.0.1:3000/api/job-update-check/context
```

If `posts` is empty, do not browse or submit an update.

Build one strict JSON object with `warnings` and `updates` arrays.

Every update needs these fields:

- `jobPostId`: the exact returned job ID.
- `externalId`: one stable event identity.
- `summary`: one concrete summary without unrelated private content.
- `sourceUrl`: an HTTP(S) URL or `null`.
- `occurredAt`: an ISO-8601 timestamp with an offset.

An application event uses this shape:

```json
{
    "kind": "application-status",
    "jobPostId": "returned UUID",
    "source": "gmail",
    "externalId": "stable event ID",
    "summary": "concrete status evidence",
    "sourceUrl": "https://mail.google.com/...",
    "occurredAt": "2026-08-18T12:00:00-04:00",
    "status": "interviewing"
}
```

An outreach event uses `kind: "outreach-response"`. It uses source `gmail` or `linkedin` and the exact `outreachContactId`.

A review event uses `kind: "review-needed"`. Its `outreachContactId` can be the exact contact ID or `null`.

Submit the complete object once:

```text
POST http://127.0.0.1:3000/api/job-update-check
Content-Type: application/json
```

Retrying the identical payload is safe. Do not change valid evidence to make a rejected payload pass.

Fetch context again after a successful response. Confirm completed applications and responded contacts leave the context.

Unchanged active work must remain. A `review-needed` event can also remain.

## Browser use

Use connected Chrome and existing sessions. Create tabs only for this run and close them afterward.

Search Gmail by each returned company, role, and relevant date. Open only messages that could match.

Search LinkedIn messages for each exact returned contact. Inspect only that matching conversation.

Never search before the returned `appliedAt` or `messagedAt` value.

Record sign-in, verification, CAPTCHA, and permission failures as warnings. Continue with other available sources.

## Mutation boundary

Do not send, draft, archive, delete, label, mark, or react to email or messages.

Do not change profiles, connections, notifications, repositories, or instruction files.

Allowed writes include Docker state, ignored backups, one temporary payload, API updates, and compact task memory.

Task memory can contain only these items:

- The last successful run time in `America/Detroit`.
- Current Gmail or LinkedIn blockers.
- Unresolved API or delivery failures.
