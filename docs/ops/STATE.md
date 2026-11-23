# PortPass: where things stand

The page both sides read first: Claude Code in this repo, and the Beckford HQ project, which reads it from GitHub. `/handoff` keeps it true. Env var names only: no values, keys, emails, phone numbers or children's details.

## Live on production
| Feature | PR | Merged |
| --- | --- | --- |
| Brief 34, children's data locked: every Futprep staff action (sessions, coaches, private sessions, Team, classes, login links) reads and writes Futprep's rows only; emergency contact and pickup only for the medical view, and for coaches on the session's own day (logged); one child's balance reads every payment | #217 | 17 Oct |
| Growth plan week 1 ([report](../briefs/growth-week1-report.md)): the plan cards list only features with a screen (migration `202610270003`, live), and /pricing carries the Marketplace attribution rule | #234 | 17 Oct |
| Each PortPass invoice carries the agreement version it was raised under, on its PDF and the Admin invoice page (migration `202610270002`, live) | #235 | 17 Oct |
| Billing rehearsal: `.github/workflows/billing-rehearsal.yml` plays the billing chain end to end on TEST data on every PR to `main` (about 3 minutes; draft, send refused without bank details, sent, part paid, paid, PDFs in the artifact) | #233 | 17 Oct |
| WeddingWire widgets from a member ID and three switches, never stored HTML (migration `202610270001`, live) | #185 | 17 Oct |
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
| `claude/keen-volta-6u6jdp` (drop the read-only WeddingWire HTML columns; rebased 23 Nov) | #236 | Merge the code, then apply `202610280005_drop_weddingwire_html_columns.sql` (renumbered from 0001, after #270's 0003) with Bex's OK. No code on `main` reads the columns | Bex's OK |
| `fix/bws-site-fixes` (Bahamas Weddings team; the 19 Nov site fixes moved off `feat/class-feed`, 22 Nov) | (this PR) | On bahamasweddingsbythesea.com: no "Open now" badge, category "Wedding officiant & planner"; review heading from `reviewCount`; WhatsApp opening line without "found you on PortPass"; JSON-LD and og:image on the domain; planner canonical on the domain and in the domain sitemap; staff login noindex; `planner_submit` analytics event. Migration `202610280003_bws_faq_price_answer.sql` (data only) rewrites the "How much does a ceremony cost?" answer | Security & QA review; Antonio's OK to merge; a separate OK to apply `202610280003` |
| `feat/bws-enquiry-capture` (Bahamas Weddings team, B$450 bundle jobs 2 and 3, 23 Nov) | (this PR) | Planner step 2 asks names, email (required), phone and consent and saves a "started" lead (utm.planner_stage) so an unfinished enquiry still reaches the Wedding Desk; the full plan fills in that same row. Instant reply to the couple, off until `WEDDING_AUTOREPLY=on` and `WEDDING_DESK_REPLY_TO` are set. GA4 on the two BWS pages only, from `NEXT_PUBLIC_BWS_GA4_ID`, storage consent denied (cookieless). CSP allows googletagmanager and google-analytics. No migration | Security & QA review; Antonio's OK to merge; the client's GA4 ID and reply inbox; Antonio turns the reply on after the client approves the wording |
| `feat/sports-only` | (this PR) | bahamasweddingsbythesea.com is live (Vercel domain added, GoDaddy A record to 76.76.21.21, BWS `custom_domain` set, 29 Oct); the domain now shows the full wedding page (gallery, services, reviews) without PortPass's parts | None |
| `feat/website-must-fix` (Website & Growth, [plan](../briefs/website-growth-plan.md), [report](../briefs/website-must-fix-report.md)): one card line on every page, weddings out of /terms (Terms v3), the home steps and portpassbahamas.com's robots.txt, loading words out of the server HTML | (this PR) | Review and merge | Antonio: Terms v3 OK, and the plan's questions |
| `chore/guard-private-files` (after the 20 Nov look book exposure) | (this PR) | `lib/repoFiles.static.test.ts` fails CI on a `private/` folder (any case, any depth), a stray look book, a PDF, photo, video, CSV/TSV export, document, archive, mail or contact file outside the reviewed `ALLOWED_PATHS` (public/ narrowed to brand/, weddings/, futprep/ and named logos), or a renamed one caught by its first bytes | Antonio's OK |
| `feat/futprep-lookbook` (private Futprep look book for Alex, Draft 1) | (this PR) | `/lookbook/futprep`, opens only with the secret key in the link (`?k=`), held in env var `FUTPREP_LOOKBOOK_KEY` (fails closed when unset); noindex, no-store, no links from the site. The book itself is never in this public repo: it is read from a private Supabase Storage bucket `lookbooks` (folder `futprep-draft1/`); its assets load behind the same key via a path-scoped cookie | Antonio: create the bucket and upload Site Design's folder, set the env var; Security & QA review; Antonio approves |
| `fix/apply-any-business` | (this PR) | /apply takes any kind of business (a list in everyday words, plus "Something else"), so a salon or caterer can ask for a First Look; the kind is kept in `applications.activity_type`, the section only where one fits; no migration | Security & QA, then Bex |
| `feat/market-b` (brief 25 B, the public Market) | #196 | CI green; then C (`feat/market-c`, WIP) and D | Claude Code (brief 25 session) |
| `feat/coaches-a` (brief 31 A, one staff login and one role per person) | #197 | `build` and `screenshots` failing; four questions in the PR before rows are switched | Antonio's answers; then Claude Code |
| `fix/promotions-under-lock` (waitlist promotions and "Confirm the place" under the class's lock) | #220 | Its fix and migration | Claude Code |
| `chore/graphify` (brief 30) | #190 | Nothing; CI green. Parked by the growth plan | The fifth paid invoice |
| `chore/csp-enforce` (brief 26) | #183 | #185 is in; rebase on `main`. Parked by the growth plan | The fifth paid invoice |
| `claude/epic-pascal-exee2o` (lint in CI) | #176 | Rebase on `main`, re-run CI (green on 6 Oct). Parked by the growth plan | The fifth paid invoice |
| `fix/export-private-notes` (rule 3: the business export leaves out a parent's private-session goal and notes) | #221 | Rebased 23 Nov; CI, then Security & QA's re-review | Bex's OK to merge |

**19 Oct 2026: PortPass is sports, fitness and gyms only.** Weddings, Venues, Tours, Entertainment, Food & Drink, Services and Shop are hidden in Admin → Sections; PortPass Market, Drops and orders redirect home on portpassbahamas.com; the wedding pages redirect to Bahamas Weddings By The Sea's own domain, which renders it through `/sites` (the business stays published for that, unlisted from the directory and filtered out of search). No code was deleted: each section comes back by un-hiding it and deleting its redirect lines in `next.config.ts`. This PR is the one exception to the no-PRs rule below.

**The growth plan of 16 Oct ("cash first, in the wedge") says no new PRs until the fifth paid invoice.** Week 1's builds are merged (#185, #233, #235, #234). Also parked by it: brief 35 (#232), the Hermes link (#226), the BWS domain plan.

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
| none | Growth plan, week 1 (the 16 Oct plan's Claude Code pieces) | merged | [growth-week1](../briefs/growth-week1-report.md) |

Briefs 28 and 32 have left no trace in this repo; their status is in the HQ project.

## Waiting on Antonio
- **First: set `CRON_SECRET`** (Vercel → Production). Production logs show `/api/cron/daily` and `/api/cron/attendance-nudge` refused with 503 on every run since at least 9 Oct, so the 90-day health-record purge (rule 3), billing, the demo reset and export pruning are not running.
- **Emails (16 Nov, fix/resend-send-failures):** no email has ever reached Resend; production logged `Resend send failed (400)` on 10 Nov. The domain is verified and `PORTPASS_FROM_EMAIL` / `FUTPREP_FROM_EMAIL` are well formed, so the likeliest cause is the `RESEND_API_KEY` value (Production only, not Preview). Paste the "PortPass production" key again in Vercel, with no quotes or spaces. The PR trims stray quotes and whitespace and logs Resend's reason for any refusal, so the next failure names its cause.
- **Before the first invoice (growth plan week 1), all clicks, no code:**
  - `PORTPASS_FROM_EMAIL` on a verified Resend domain (done: set, domain verified);
  - `RESEND_WEBHOOK_SECRET`;
  - the four bank details in Admin → Settings (bank, account name, account number, branch). No invoice can be sent until all four are in;
  - Futprep owner access;
  - the agreement text v1.0, with its version typed on each billing account;
  - confirm the attribution wording on /pricing. The reviewer noted "came through your PortPass page" also covers customers a business sends to its own page;
  - say whether quotes and /pricing should read "no VAT charged". PortPass is not VAT-registered (Antonio, 17 Oct); /pricing still says "Prices are in BSD."
- **First-admin doors (#206, 19 Nov):** on both desks, "Create the first account" now opens only for a signed-in PortPass owner with the admin second step; anyone else gets a 404. The Wedding Desk's one login (12 Oct) is Antonio's. Antonio asked on 19 Nov to wipe every staff and admin login and start over; that waits on his OK to the exact list.
- #197 (brief 31 A): answer its four questions; nothing is switched until then.
- Futprep: make an owner (Admin → People); until then nobody can open `/business/futprep`.
- Futprep data: offerings 1 and 2 still show Term 1 dates; staff logins have no emails.
- **Futprep Term 2 (16 Nov, feat/futprep-term2):** migration `202610270004_futprep_term2_schedule.sql` was applied to the live database on 16 Nov with Antonio's OK (before it, Term 2 ended 20 Mar, charged $300/$420, had a 12 Dec taster and opened on 19 Nov). It sets 9 Jan–13 Mar, $340/$420, taster = free Kickoff Day 19 Dec, opening 7 Dec, and adds Juniors and three Fundamentals classes unlisted (Juniors proposed, Fundamentals field not confirmed). Weekly fees are set to a tenth of the term price; confirm or switch weekly payment off.
- The other brief 21 dashboard switches in `docs/security/README.md` (all unticked on `main`): `RESEND_WEBHOOK_SECRET`, `BACKUP_HEARTBEAT_SECRET`, Supabase OTP and session limits, the two firewall rules, bot protection, the restore drill.

- **Futprep off PortPass's public pages (19 Nov, feat/futprep-links-out, not merged):** Antonio asked to keep Futprep as one card that sends families to futprep.com. Its page, class pages, registration, camps, taster and booking redirect there; staff PINs, /futprep/my, /business/futprep and the APIs stay. The Christmas camp has no registrations.

- **register.futprep.com (19 Nov, feat/register-futprep-domain, stacked on #258, not merged):** futprep.com's Register and Book buttons go to register.futprep.com, which serves Futprep registration, the taster, booking, camps, /futprep/my, /futprep/feed and sign-in; anything else goes to futprep.com, staff back to PortPass. Needs, after 23 Nov: the DNS record, the domain in Vercel, and the address in Supabase Auth's redirect URLs.

## Known issues
- **Public repo, private files (19 Nov):** client documents (`.docx`, `.pdf`), a WhatsApp export and two local HTML calculators sat untracked in the repo root of one PC. None was ever committed (checked across every branch). `.gitignore` now keeps root-level `.docx`, `.pdf`, `whatsapp-export/` and those files out. Antonio: move them to a private folder outside the repo.
- **Look book briefly public (20 Nov), accepted:** an early commit on #265's branch briefly held Site Design's FutPrep Look Book Draft 1 (no children's data, no photos of children) in this public repo, for about 15 minutes; it was removed and Antonio accepted it. Since then look books live only in the private Storage bucket `lookbooks`, `.gitignore` keeps `/private/` out, the guard test (#266) fails any such file, and screenshots of private pages go to the shared notes folder, never GitHub.
Ponytail audit, 11 Oct (15 findings, in the brief 33 PR). The top five are fixed: 1, 3 and 4 by #205; 2 by #200 (migration `202610220001`, applied live 12 Oct); 5 by #203; brief 34 (#217) closed what they left of 1, 4 and 5 (who sees what: `docs/briefs/brief34-child-data-lock-report.md`). Findings 6, 7 and 9 (sign-in) have their own PRs; 8 and 10–15 are not fixed.

Left open by the reviews of #200, #203, #216, #217 and #222 (not fixed):
- Promoting a child from the waitlist (`db/staff.ts` `updateFutprepRegistration`) and the business "Confirm the place" button (audit 10) count and then write without the class lock; moving a cancelled row back to pending has no cap check. Being fixed in #220.
- Moving a child to another class from the desk record (`updateFutprepRegistrationDetail`) doesn't check that class's cap.
- A child can get free tasters in two classes at the same moment (`TRIAL_ALREADY_USED` covers the business, the lock one class).
- `db/coaches.ts` keeps `if (!organizationId)` guards that are dead now `futprepOrganizationId()` throws instead (#222). Its rows by id alone are Futprep-only since #217.
- Still unpaged: `listProgramPnl`'s payments (`db/coachPay.ts`) and the private sessions inbox's payments (`listPrivateSessionRequests`, every business's). The rest of the desk's reads are paged since #223.

Business export (`db/businessExport.ts`), found while fixing its private-session notes (not fixed):
- It orders every table by `id`, but `organization_categories`, `shops`, `organization_payment_settings` and `drop_items` have no `id` column, so the export probably fails for every business (from the code; not run against a database).
- Two link keys are exported: `reservations.receipt_token` and `drops.followers_token`.

Launch checklist for 19 Nov: `docs/ops/launch-checklist-19nov.md` (12 fail, 6 unchecked). Also deferred:
- The CSP keeps `'unsafe-inline'` and is report-only until #183.
- 91 signed-in API routes still take bodies without zod; `lib/api/body.static.test.ts` lists them and can only shrink.
- Lint is not in CI (#176); 35 warnings remain.
- The owner dashboard's "Collected" counts payment requests only; Term 1's desk payments are not in it.
- A coach accepting a private session on production is untested (it needs a staff PIN sign-in).
- `wedding_site_settings` keeps three read-only generated `*_html` columns (from `202610270001`) until a follow-up migration drops them; nothing reads them now #185 is deployed.
- The plan cache key in `db/pricing.ts` carries `202610270003`: the next migration that changes `pricing_plans` must bump it, or /pricing keeps the old plans until someone saves a price.
- The billing chain has run only in the rehearsal, never in production: no billing account, no invoice yet.

## Last updated
23 Nov 2026, by Claude Code (PR #217, brief 34, merged with main). Other rows as of their own dates.
