# PortPass: where things stand

The page both sides read first: Claude Code in this repo, and the Beckford HQ project, which reads it from GitHub. `/handoff` keeps it true. Env var names only: no values, keys, emails, phone numbers or children's details.

## Live on production
| Feature | PR | Merged |
| --- | --- | --- |
| Futprep coaches (brief 31 A–C): one staff login and one role per person (duplicates switched off), the medical switch, the owner bridge; places and their costs, the field-cost estimate, the operating map `/futprep/staff/ops`; each coach's own inbox, My days, places on `/futprep/book`, private-session pay rates and a pay line per completed session | #197, #212, #209 | 12 Oct |
| PortPass Market (brief 25 B–D): the public Market, orders through payment requests, PortPass Points as a ledger only | #196, #199, #207 | 11–12 Oct |
| Term 2 ready: the last place in a class goes to one child, desk balances read every payment, Futprep's doors and lookups find Futprep's own only | #200, #203, #216, #222 | 12 Oct |
| Rule 3 (audit 1, 3, 4): Futprep's desk reads Futprep's registrations only, notes behind the medical permission, pickup and emergency out of lists and the CSV | #205 | 12 Oct |
| Sign-in hardening A–C and the secret-key scripts refuse anything but a local stack; database checks for views that read past RLS | #201, #202, #204, #211, #208 | 12 Oct |
| One Mind: this file, `/handoff`, Ponytail and shipping skills, the 19 Nov launch checklist | #198 | 12 Oct |
| PortPass Market sellers, Admin → Market | #184 | 11 Oct |
| Futprep reset: Term 1 closed, Term 2 opens 19 Nov, owner dashboard, three-tap registration, Flamingo Night | #191–#195 | 11 Oct |
| Futprep private sessions: emails, 30 and 60 minutes, FP-S references, coach working days, `/futprep/book` | #186–#189 | 8–9 Oct |
| Harbour Motion; hardening; Security Phase 1; repo agents | #148–#182 | 5–6 Oct |
| Phase 1 close-out, public site from the data, `/demo`, payment requests, Drops | #120–#147 | 1–5 Oct |

## In flight
Previews are `https://portpass-git-<branch, / as ->-port-pass.vercel.app`, behind the Vercel sign-in.
| Branch | PR | What's left | Waiting on |
| --- | --- | --- | --- |
| `feat/coaches-d` (brief 31 D, the Progress Passport) | #213 | CI and the Phase 1 run on the rebased head, then merge. Both migrations applied live | Claude Code |
| `feat/coaches-e` (brief 31 E, the proof run) | #214 (draft) | Rebase after D merges; the walk passed 9/9 before the header fix, re-running | Claude Code |
| `fix/futprep-session-scope` | #225 | Futprep staff screens change Futprep's own rows only; gitleaks failing | its session |
| `claude/zen-goodall-91swi2` | #224 | A private-session payment recorded once | its session |
| `fix/desk-reads-paged` | #223 | The rest of the desk reads every row; gitleaks failing | its session |
| `fix/export-private-notes` | #221 | The export leaves out private-session goal and notes (rule 3) | its session |
| `fix/promotions-under-lock` | #220 (draft) | Waitlist promotions respect the cap; gitleaks failing | its session |
| `claude/festive-galileo-agb7bb` | #219 | Team and the registration record fit 375px | its session |
| `feat/wedding-gallery-image-check`, `claude/wonderful-bohr-t2k9hi` | #218, #215 | Wedding Desk photos must be BWS's own; #215's build failing | their sessions |
| `fix/child-data-lock` (brief 34) | #217 (draft) | Lock children's data before launch | its session |
| `claude/fervent-dijkstra-00tv4m` | #210 | BWS offerings follow its packages | its session |
| `fix/signin-hardening-d` | #206 (draft) | The first-admin screen for a signed-in founder only | its session |
| `chore/graphify` (brief 30) | #190 | Nothing; CI green | Antonio's decision |
| `claude/keen-volta-6u6jdp` (WeddingWire) | #185 | Renumber its migration, apply it live | Antonio's decision |
| `chore/csp-enforce` (brief 26) | #183 | Merge after #185 | #185 |
| `claude/epic-pascal-exee2o` (lint in CI) | #176 | Rebase, re-run CI | Antonio's decision |

## Briefs
| No. | Title | Status | Report |
| --- | --- | --- | --- |
| 19–24 | Phase 1 close-out; CLAUDE.md and agents; Security Phase 1; Harbour Motion; agents; hardening | merged | none (`docs/security/`, `docs/motion.md`) |
| 25 | PortPass Market, Phase 1 | merged (A–D) | none yet |
| 26 | Enforce the CSP | held | none |
| 27 | Futprep reset | merged | [brief27](../briefs/brief27-futprep-reset-report.md) |
| 29 | Private sessions | merged | [brief29](../briefs/brief29-private-sessions-report.md) |
| 30 | graphify | held | [brief30](../briefs/brief30-graphify-report.md) |
| 31 | The Futprep coaches back end | building (A–C merged, D in review, E draft) | [brief31](../briefs/brief31-coaches-report.md) |
| 33 | One Mind: STATE.md and `/handoff` | merged | [brief33](../briefs/brief33-one-mind-report.md) |
| 34 | Lock children's data before launch | building (#217) | none yet |

Briefs 28 and 32 have left no trace in this repo; their status is in the HQ project.

## Waiting on Antonio
- **First: set `CRON_SECRET`** (Vercel → Production). The daily crons are refused with 503, so the 90-day health purge (rule 3), billing, the demo reset and export pruning are not running.
- **Create the Wedding Desk's first staff account** at `/weddings/staff/login` (the page offers "Create the first account" to anyone until then).
- Brief 31: the nine questions in its report: row 10 "Coach Kione", Ronaldo's login (42), admin medical views, which coaches see health notes, Adon's login, the old place name on programs 1 and 2, place costs on Staff → Locations, a lead coach for camps 157 and 159, and whether Bex's admin login sees emergency and pickup on the roster.
- #185, #176, #190: merge or close.
- Futprep: make an owner (Admin → People); Term 2's 12 Dec taster date; offerings 1 and 2 still show Term 1 dates; staff logins have no emails.
- The other brief 21 dashboard switches in `docs/security/README.md`.

## Known issues
- Ponytail audit, 11 Oct: findings 1–5 fixed (#200, #203, #205); 6, 7, 9 have their own PRs; 8 and 10–15 open (#220 and #223 take some).
- A child can get free tasters in two classes at once (`TRIAL_ALREADY_USED` covers the business, the lock one class).
- Brief 31 follow-ups: deleting a default passport skill would cascade its marks off shared passports (retire with `active = false` instead); the static guard test checks files, not each handler; no time window on passport note and share for coaches.
- gitleaks is failing on #220, #223 and #225.
- #185's migration clashes with `202610190002` on `main`; the CSP is report-only until #183; 91 signed-in routes still take bodies without zod; lint not in CI (#176).
- The owner dashboard's "Collected" counts payment requests only.

Launch checklist for 19 Nov: `docs/ops/launch-checklist-19nov.md`.

## Last updated
12 Oct 2026, `main` at `67d3372`, by Claude Code (brief 31, branch `feat/coaches-e`).
