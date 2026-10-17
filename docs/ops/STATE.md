# PortPass: where things stand

The page both sides read first: Claude Code in this repo, and the Beckford HQ project, which reads it from GitHub. `/handoff` keeps it true. Env var names only: no values, keys, emails, phone numbers or children's details.

## Live on production
| Feature | PR | Merged |
| --- | --- | --- |
| Brief 34, children's data locked: every Futprep staff action (sessions, coaches, private sessions, Team, classes, login links) reads and writes Futprep's rows only; emergency contact and pickup only for the medical view, and for coaches on the session's own day (logged); one child's balance reads every payment | #217 | 12 Oct |
| PortPass Market (brief 25 B–D): the public Market, orders through payment requests, PortPass Points (a ledger only) | #196, #199, #207 | 11–12 Oct |
| Term 2 ready: the last place in a class goes to one child (one locked database call, `create_registration_within_cap`), desk balances read every payment, Futprep's doors open Futprep's classes only | #200, #203, #216 | 12 Oct |
| Rule 3 (review of #216): Futprep's lookups by reference code (parent lookup, finish registration, join after a taster) find Futprep's registrations only; `futprepOrganizationId()` by slug alone, no name-match fallback | #222 | 12 Oct |
| Rule 3 (audit 1, 3, 4): Futprep's desk reads Futprep's registrations only, notes behind the medical permission, pickup and emergency details out of lists and the CSV | #205 | 12 Oct |
| One Mind: `docs/ops/STATE.md`, `/handoff`, Ponytail and shipping skills, the 19 Nov launch checklist | #198 | 12 Oct |
| PortPass Market sellers: verification ("Made in The Bahamas"), always-on storefronts, Admin → Market | #184 | 11 Oct |
| Futprep reset: Term 1 closed to new families, Term 2 opens 19 Nov, owner dashboard, three-tap registration, Flamingo Night | #191–#195 | 11 Oct |
| Futprep private sessions: emails and log lines, 30 and 60 minutes from the database, FP-S references, coach working days, `/futprep/book` | #186–#189 | 8–9 Oct |
| Harbour Motion (M1–M5) and the AA hero lede | #168, #175, #178–#182 | 6 Oct |
| Hardening: scrypt staff PINs, `npm ci`, gitleaks fails on any error, planner limit | #169, #171, #172, #174 | 6 Oct |
| Security Phase 1: fail-closed secrets, RLS on every table, sign-in limits, headers (CSP report-only), zod on public routes, alerts, backup docs | #150–#154, #156, #157, #165, #166 | 5–6 Oct |
| Repo agents and commands in `.claude/` | #148, #167 | 5–6 Oct |
| Phase 1 close-out: booking requests, page checklist, phone photos, Admin → Phase 1, the end-to-end run | #142–#147 | 5 Oct |
| Public site from the data, sign-up, Get paid, registration for any business, `/demo` | #132–#139 | 4 Oct |
| Payment requests and reconciliation (cash and bank transfer only) | #124 | 1 Oct |
| Drops / Shop Bahamian pre-orders | #120, #122 | 1 Oct |

## In flight
Previews are `https://portpass-git-<branch, / as ->-port-pass.vercel.app`, behind the Vercel sign-in.
| Branch | PR | What's left | Waiting on |
| --- | --- | --- | --- |
| `fix/promotions-under-lock` (waitlist promotions and "Confirm the place" under the class's lock) | #220 | Its fix and migration | Claude Code |
| `chore/graphify` (brief 30) | #190 | Nothing; CI green | Antonio's OK |
| `claude/keen-volta-6u6jdp` (WeddingWire, fixes a #183 finding) | #185 | Merge. Its migration (`202610270001`) is live since 17 Oct, and the Desk's content screen can't save until this merges. Then a follow-up drops the three read-only HTML columns | Antonio: merge |
| `chore/csp-enforce` (brief 26) | #183 | Merge after #185 | #185 |
| `claude/epic-pascal-exee2o` (lint in CI) | #176 | Rebase on `main`, re-run CI (green on 6 Oct) | A decision: merge or close |

## Briefs
| No. | Title | Status | Report |
| --- | --- | --- | --- |
| 19 | Phase 1 close-out | merged | none |
| 20 | CLAUDE.md, agents, commands | merged | none |
| 21 | Security hardening, Phase 1 | merged | none (`docs/security/`) |
| 22 | Harbour Motion | merged | none (`docs/motion.md`) |
| 23 | Agents from everything-claude-code | merged | none |
| 24 | Hardening follow-ups | merged | none |
| 25 | PortPass Market, Phase 1 | merged (A–D) | none (in the PR bodies) |
| 26 | Enforce the CSP | held | none |
| 27 | Futprep reset | merged | [brief27](../briefs/brief27-futprep-reset-report.md) |
| 29 | Private sessions | merged | [brief29](../briefs/brief29-private-sessions-report.md) |
| 30 | graphify | held | [brief30](../briefs/brief30-graphify-report.md) |
| 31 | Staff logins: one person, one login, one role | building | none yet |
| 33 | One Mind: STATE.md and `/handoff` | merged | [brief33](../briefs/brief33-one-mind-report.md) |
| 34 | Lock children's data before launch | merged | [brief34](../briefs/brief34-child-data-lock-report.md) |

Briefs 28 and 32 have left no trace in this repo; their status is in the HQ project.

## Waiting on Antonio
- **First: set `CRON_SECRET`** (Vercel → Production). Production logs show `/api/cron/daily` and `/api/cron/attendance-nudge` refused with 503 on every run since at least 9 Oct, so the 90-day health-record purge (rule 3), billing, the demo reset and export pruning are not running.
- **Also now: create the Wedding Desk's first staff account** at `/weddings/staff/login`. None has ever been made, so the page offers "Create the first account" to anyone, and whoever fills it in becomes its admin. The PIN-hardening session is adding a platform-owner sign-in to that screen on both desks.
- #197 (brief 31 A): answer its four questions; nothing is switched until then.
- #185: merge it. Its migration is live since 17 Oct; until it merges the Wedding Desk's content screen can't save (the page is unaffected). #190: OK or no.
- Futprep: make an owner (Admin → People); until then nobody can open `/business/futprep`.
- Futprep data: clear or keep Term 2's 12 Dec taster date before 19 Nov; offerings 1 and 2 still show Term 1 dates; staff logins have no emails.
- The other brief 21 dashboard switches in `docs/security/README.md` (all unticked on `main`): `RESEND_WEBHOOK_SECRET`, `BACKUP_HEARTBEAT_SECRET`, Supabase OTP and session limits, the two firewall rules, bot protection, the restore drill.

## Known issues
Ponytail audit, 11 Oct (15 findings, in the brief 33 PR). The top five are fixed: 1, 3 and 4 by #205; 2 by #200 (migration `202610220001`, applied live 12 Oct); 5 by #203; brief 34 (#217) closed what they left of 1, 4 and 5 (who sees what: `docs/briefs/brief34-child-data-lock-report.md`). Findings 6, 7 and 9 (sign-in) have their own PRs; 8 and 10–15 are not fixed.

Left open by the reviews of #200, #203, #216, #217 and #222 (not fixed):
- Promoting a child from the waitlist (`db/staff.ts` `updateFutprepRegistration`) and the business "Confirm the place" button (audit 10) count and then write without the class lock; moving a cancelled row back to pending has no cap check. Being fixed in #220.
- Moving a child to another class from the desk record (`updateFutprepRegistrationDetail`) doesn't check that class's cap.
- A child can get free tasters in two classes at the same moment (`TRIAL_ALREADY_USED` covers the business, the lock one class).
- `db/coaches.ts` keeps `if (!organizationId)` guards that are dead now `futprepOrganizationId()` throws instead (#222). Its rows by id alone are Futprep-only since #217.
- Still unpaged in `db/staff.ts`: session counts (~252), session plans (~798), work logs (~819), the roster export's payments and attendance (~1420; a long camp passes 1,000 attendance rows); `listProgramPnl`'s payments (`db/coachPay.ts`); the private sessions inbox's payments (`listPrivateSessionRequests`, every business's); the admin page builds the desk list twice.

Launch checklist for 19 Nov: `docs/ops/launch-checklist-19nov.md` (12 fail, 6 unchecked). Also deferred:
- The CSP keeps `'unsafe-inline'` and is report-only until #183.
- 91 signed-in API routes still take bodies without zod; `lib/api/body.static.test.ts` lists them and can only shrink.
- Lint is not in CI (#176); 35 warnings remain.
- The owner dashboard's "Collected" counts payment requests only; Term 1's desk payments are not in it.
- A coach accepting a private session on production is untested (it needs a staff PIN sign-in).

## Last updated
17 Oct 2026, `main` at `0067166`, by Claude Code (PR #217, brief 34; #185 added its own rows on 17 Oct).
