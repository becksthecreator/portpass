# Growth plan, week 1: the Claude Code builds — report

The 16 Oct 2026 plan, "cash first, in the wedge", gives Claude Code week 1 only, then no PRs until the fifth paid invoice. The plan itself lives outside this public repo. These were its five pieces, one PR each from `main`, built on 17 Oct.

| # | PR | What | Migration (applied live first, with Antonio's yes in the session) |
| --- | --- | --- | --- |
| 1 | #185 | WeddingWire widgets: a member ID and three switches, never stored HTML. Renumbered and merged whole | `202610270001_weddingwire_widgets_structured` |
| 2 | #233 | Billing rehearsal: a GitHub workflow that plays PortPass's billing chain end to end on TEST data | none |
| 3 | #235 | Each invoice carries the agreement version it was raised under, on its PDF and the Admin invoice page | `202610270002_invoice_agreement_version` |
| 4 | #234 | Plan cards list only features with a screen; the Marketplace attribution rule on /pricing | `202610270003_plan_cards_features_with_a_screen` |

## Decisions
- **#185:** its old number `202610190002` clashed with `main`. The new number runs after `main`'s highest and the open PRs' `202610260001`. Antonio confirmed the live apply in the session, knowing it drops and re-adds columns. The byte-for-byte check passed, and all three widgets stayed on.
- **The rehearsal runs on every PR to `main`**, beside CI and not a required check, because it takes about three minutes. It makes its own `CRON_SECRET` each run and has no email key. The only billing address is `@example.com`. It refuses to start unless both the app and Supabase are on the machine it runs on, and unless the founder is `@test.portpass.local`.
- **The agreement version was already on the billing account** (`202610090001`), with its field next to "Agreement signed on". What was missing was the version on the invoice. A before-insert trigger copies it onto every invoice raised (daily job, manual, Market) and never rewrites one later. Old invoices entered by hand get none.
- **No VAT line.** Antonio said in the session that PortPass is not VAT-registered. The /pricing VAT answer still reads "Prices are in BSD."; the plan's "no VAT charged" wording is his to approve.
- **Plan cards by migration** (Antonio's choice), by plan code. Only Availability, Packages, Per-staff reporting and Priority support come off. The plan cache key carries the migration number, because the data cache outlives deploys and a migration calls no save. The next migration that changes `pricing_plans` must bump the key too.
- **The attribution rule** is the plan's own wording. The reviewer noted that "came through your PortPass page" also covers customers a business sends to its own page, which is wider than "bookings PortPass brought you" above it. Antonio to confirm the wording before Marketplace is sold.

## Tests run
- CI on every PR: the unit tests, `next build --webpack`, and the integration tests, Futprep's among them.
- The billing rehearsal on #233, and again on #235 with the agreement version checked on the TEST invoice's PDF.
- The Phase 1 end-to-end workflow before #233, #235 and #234 merged.
- `reviewer` and `security-reviewer` on #233, #234 and #235, run as subagents. Their findings and what was done are in each PR.

## Env var names
No new ones for the app. The rehearsal job sets `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `CRON_SECRET` and `PLATFORM_OWNER_EMAILS` for its own local stack only.

## For Antonio (clicks, not code)
1. `CRON_SECRET` in Vercel (Production). The daily job has answered 503 since at least 9 Oct, so nothing drafts until it is set.
2. `PORTPASS_FROM_EMAIL` on a verified Resend domain.
3. `RESEND_WEBHOOK_SECRET`.
4. The four bank details in Admin → Settings (bank, account name, account number, branch). Until then no invoice can be sent.
5. Futprep owner access (Admin → People).
6. The agreement text, v1.0, and its version typed on each billing account.
7. Confirm the attribution wording on /pricing, and whether quotes and /pricing should say "no VAT charged".

From here the plan says no new PRs until the fifth paid invoice.
