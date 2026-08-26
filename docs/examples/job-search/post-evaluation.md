# Job Post Evaluation

Read `user-info.md` before you evaluate a role. Use responsibilities and requirements, not title matches alone.

## Source integrity

- Prefer the current employer page or a reputable applicant tracking system page.
- Confirm that the role is active before you call it active.
- Keep the job page URL separate from the direct application URL.
- Preserve the complete visible job description as readable plain text.
- Remove page controls and application form text from the description.
- Never summarize or rewrite the description.
- Extract only facts that the source states.
- Use `Not specified` when the source names no technology stack.
- Use `null` only for unavailable location, compensation, or legitimacy notes.
- Treat missing applicant evidence as `not documented`, not inability.

## Eligibility

Reject a role when it conflicts with a required limit in `user-info.md`.

Reject a role when any of these conditions apply:

- The source confirms that the role is inactive.
- The employer or role is not specific.
- No legitimate public application route exists.
- The complete job description is not available.
- The required level or experience exceeds the applicant's stated limit.
- The location, authorization, clearance, sector, or compensation violates a stated limit.
- The application requires an action that violates a stated application limit.
- The role's main work is outside the applicant's target scope.

A normal employer account can be acceptable. Record the account step in `applicationFlow`.

## Evidence fit

Identify the small set of responsibilities that defines the role.

- Require direct evidence for the main responsibilities.
- Require direct evidence for at least one central implementation technology.
- Keep professional, substantial-project, coursework, and familiarity evidence separate.
- Let one bounded technology or domain transfer support an otherwise direct match.
- Treat several central transfers as one material mismatch.
- Do not use project work as professional tenure.
- Do not infer production ownership from familiarity or coursework.
- Treat preferred qualifications as secondary unless they define the work.

## Labels

Use `target` for a strong and direct match. The level must be realistic and worth a tailored application.

Use `quick-app` for a credible match with one material, nonfatal stretch. State the stretch clearly.

Do not use `quick-app` to hide unsupported central work or several material gaps.

## Recommendation content

- Make `fitRationale` specific to the role and the documented evidence.
- Put visible application steps and unknowns in `applicationFlow`.
- Put current source evidence in `keyLegitimacySignals`.
- Put material legitimacy concerns in `legitimacyNotes`.
- Select `frontend` or `backend-full-stack` for a scheduled report. A user-added import can also use `general`.
- Make `recommendedAction` truthful, specific, and concise.
- Never invent experience, relationships, facts, or application results.
