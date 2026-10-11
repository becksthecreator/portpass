# Brief 33: One Mind, the shared state file and `/handoff` — report

One branch, `chore/one-mind`, one PR. No app code changed.

| Part | What it is |
| --- | --- |
| A | `docs/ops/STATE.md`; a `## One Mind (handoff)` section in `CLAUDE.md`; `.claude/commands/handoff.md`; reports for briefs 29 and 30 |
| B | Three Ponytail skills and two of Addy Osmani's agent-skills in `.claude/skills/`; a Ponytail audit and a launch checklist, report-only |

## Decisions
- We take one idea from ECC, a plain Markdown handoff, and build it here. Nothing from ECC is installed or copied.
- `/handoff` commits `STATE.md` and the report to the current branch and pushes it. It never merges, never enables auto-merge and never writes on `main`.
- Briefs 28, 31 and 32 have left no trace in this repo, so `STATE.md` says so rather than guessing.

## Migrations, env var names
None. `STATE.md` names `CRON_SECRET`, `RESEND_WEBHOOK_SECRET` and `BACKUP_HEARTBEAT_SECRET` as names only.

## Tests run
CI on the PR. No code changed, so no new tests.

## For Antonio
1. Read `docs/ops/STATE.md` → "Waiting on Antonio".
