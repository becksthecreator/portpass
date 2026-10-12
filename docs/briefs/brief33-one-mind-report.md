# Brief 33: One Mind, the shared state file and `/handoff` — report

One branch, `chore/one-mind`, one PR, two parts. No app code changed.

| Part | What it is |
| --- | --- |
| A | `docs/ops/STATE.md`; a `## One Mind (handoff)` section in `CLAUDE.md`; `.claude/commands/handoff.md`; reports for briefs 29 and 30 |
| B | Three Ponytail skills and two of Addy Osmani's agent-skills in `.claude/skills/`; a Ponytail line in `CLAUDE.md`; the pinned SHAs in `docs/briefs/README.md`; a Ponytail audit and a launch checklist, report-only |

## Decisions
- We take one idea from ECC, a plain Markdown handoff, and build it here. Nothing from ECC is installed or copied.
- `/handoff` commits `STATE.md` and the report to the current branch and pushes it. It never merges, never enables auto-merge and refuses to run on `main`.
- Briefs 28 and 32 have left no trace in this repo, so `STATE.md` says so rather than guessing. Brief 31 appeared as #197 while this PR was open.
- The copied skills keep their text. The only edits: a source note at the top of each `SKILL.md`, every install or `npx` line removed, links re-pointed to the new folders, and one secret-printing `grep` replaced (rule 6). Pinned SHAs and what was left out are in `docs/briefs/README.md`.
- The audit and the checklist were run by read-only subagents. The audit's findings 1–6 and three checklist claims were re-checked against the code before they went into `STATE.md`.

## What the checks found (not fixed here)
- **`CRON_SECRET` is not set in production.** Vercel's logs show `/api/cron/daily` and `/api/cron/attendance-nudge` refused with 503 on every run in the three days the logs keep (9–11 Oct). The 90-day health-record purge (rule 3), billing, the demo reset and export pruning are not running.
- Ponytail audit: 15 findings, 6 "must fix", three of them children's data under rule 3. Top five in `STATE.md`; the full list is in the PR.
- Launch checklist for 19 Nov (`docs/ops/launch-checklist-19nov.md`): 12 fail, 6 unchecked.

## Migrations, env var names
None. `CRON_SECRET`, `RESEND_WEBHOOK_SECRET` and `BACKUP_HEARTBEAT_SECRET` are named, never their values.

## Tests run
CI on the PR. No code changed, so no new tests. Every new file was scanned for email addresses, phone numbers, key-shaped strings and health words: none.

## For Antonio
1. Set `CRON_SECRET` in Vercel (Production) now.
2. Say whether to start the fixes for audit findings 1, 3 and 4 (children's data) and 2 and 5 (before 19 Nov).
3. The rest of "Waiting on Antonio" in `docs/ops/STATE.md`.
