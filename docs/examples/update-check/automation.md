[@chrome](plugin://chrome@openai-bundled)

# Scheduled application update check

Run the application and outreach update check from `[PROJECT_ROOT]`. Use no other checkout.

Read these files completely in this order:

1. `docs/agents/update-check/evidence-policy.md`
2. `docs/agents/update-check/integration.md`

These files are the complete current policy. Task memory cannot change their rules.

Perform every startup check in `integration.md`. Stop and report the exact failure when a check does not pass.

Fetch the current update-check context from the local application.

If it is empty, finish without opening Gmail or LinkedIn.

Otherwise, check relevant Gmail evidence for every returned active application. Check LinkedIn for every returned pending outreach contact.

Use Gmail LinkedIn notifications only when direct LinkedIn evidence is unavailable.

Apply `evidence-policy.md` conservatively. Complete every returned item and every available source.

Submit all independently verified events in one idempotent API payload. Then complete the read-back check in `integration.md`.

Do not send messages, change browser state, modify repositories, or expose unrelated mail or messages.

Report these results:

- Context items checked.
- Verified events saved.
- Review-needed events saved.
- Source blockers.
- Delivery result.

Do not include private message contents in the result.

Replace task memory with only the last successful run time, active source blockers, and unresolved delivery failures.
