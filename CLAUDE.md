# PortPass Bahamas: how we work in this repo

PortPass is a booking platform for Bahamian businesses (portpassbahamas.com). Founders: Antonio and Adon Beckford. Live businesses: Futprep Athletics (kids' football, Lyford Cay), Bahamas Weddings By The Sea. Carv Performance is drafted. Everything else is "Coming next".

## Stack

* Next.js 16 (App Router) on Vercel, region `pdx1`. Supabase (Postgres, auth by email code and Google, storage). Resend for email. Vercel Web Analytics and Speed Insights.
* Tests: `npm test` (vitest, no database) and `npm run test:integration`. The integration tests need a local Supabase stack: `supabase start`, then `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY` set to that stack, then `npx tsx scripts/seed-test-data.ts`. Lint: `npm run lint`. Every PR to `main` is checked by `.github/workflows/ci.yml`: `npm audit --omit=dev --audit-level=high`, the unit tests, `npx next build --webpack` (which type-checks every `.ts` file, tests and scripts included), and the integration tests, Futprep's among them. Lint is not part of that check. Where Node is not installed, push and read the CI result instead.
* Screenshots: `scripts/screenshots/*` and the GitHub workflows (`staff-screenshots`, `shop-screenshots`, `payments-screenshots`, `closeout-screenshots`). Each workflow runs the site on its own machine with a throwaway database and TEST data, takes 375px screenshots and saves them as an artifact. The end-to-end runs are in `scripts/e2e/*`, run by the `phase1-run` and `photos-e2e` workflows. All of these scripts sign in with the local stack's own key, so they are for a local stack only: never point one at a preview or at production.
* Migrations live in `supabase/migrations/` as `YYYYMMDDNNNN_name.sql`. The number is a sequence in that shape, and it has run ahead of the calendar: number yours after the highest one on `main`, not with today's date, or it will run before migrations it depends on. If your number clashes with one already on `main`, renumber yours. Previews and production share one database, so a migration is applied to it before the code that needs it merges.

## Rules that never bend

1. PortPass never holds money. No escrow, no balances, no wallets, no deducting fees. Customers pay the business directly. Our fees are invoiced separately.
2. Never say or imply that card payments work. They are Phase 2, with a licensed partner. "Cash and bank transfer work today" is the line.
3. Children's health, allergy, medication and emergency details never appear in lists, exports, emails, screenshots, logs or AI prompts. They are shown only to that business's authorised staff, behind the team permission, and purged 90 days after the programme ends.
4. Nothing is ever sent to a real person by a test, a seed, a demo or an agent. Use a TEST organisation and TEST customers (`@example.com`, phone `242-555-01xx`), then delete them. A send button in the demo shows "Demo: nothing was sent".
5. No scraping, no bulk messaging, no automation of Instagram, Facebook or WhatsApp. Scout drafts a message; a founder sends it by hand, one to one.
6. Report env var names only. Never print a value, a key, a PIN or a code. Keys are pasted into Vercel and Supabase by Antonio.
7. No price, no publish. A business page goes live only with at least one real price, working contact buttons and the right section.
8. Prices are in Bahamian dollars (BSD), equal to US dollars. Write `$35 per session`, never "(= USD)".
9. Futprep keeps working. Its PIN logins, `/futprep/register` and its staff screens are not broken by generic work. Run its tests.
10. The demo business (`is_demo`) never reaches public listings, search, the sitemap, totals, billing or real growth numbers.

## How a change ships

* One branch per brief (`feat/<brief-slug>`), one PR per part, rebased on `main` before opening. Small PRs over big ones. Compare and rebase against `origin/main` after a fetch: a local `main` can be behind.
* Every PR reports: changed files, migrations, env var names, tests run, and 375px screenshots of every new or changed screen (plus 1440px where layout matters).
* Before merging anything that touches booking, registration, payments or sign-in: run the Phase 1 script in `docs/qa/phase1-run.md` against a preview with a TEST business. As the document stands it is run two ways: by the GitHub workflow "Phase 1 end-to-end run (TEST data)" (`scripts/e2e/phase1-run.mjs`), on a throwaway database, and by hand on a phone for the steps a script can't do. A preview is behind the Vercel sign-in and uses the live database, so TEST rows made on a preview are live rows until they are deleted, and the scripts cannot sign in there.
* Copy is plain and local. No "platform", "solution" or "SaaS". Say what it does in one breath. The product is "PortPass", one word.
* Design: the Harbour Signal palette (`--ink` navy, `--signal` red for primary actions, `--harbour` blue for links, `--deck` background), Archivo headings. Business pages take their colours from `organizations.brand_color` through `lib/businessTheme.ts`, with AA contrast enforced, and set their headings in Fraunces (`app/fonts.ts`).
* Phone first: every screen works at 375px with no horizontal scroll.

## Where things are

* Briefs: the Claude project "The Beckford HQ", folder `ClaudeCode_Queue_Sept29/`. Read the brief you were given in full before starting. Briefs written with `/brief` are saved in `docs/briefs/`.
* The Handbook (how PortPass runs, pricing rules, onboarding steps, the lead score) is in the same project as `PortPass_Handbook.md`.
* Admin → Phase 1 shows the live checklist of what's switched on and what each business is missing.
* Agents and commands for this repo are in `.claude/`: `reviewer`, `qa-runner` and `onboarder` from brief 20, and `security-reviewer` (report-only), `planner` (read-only) and `tdd-guide`, taken from the everything-claude-code kit and rewritten for PortPass (brief 23).
* Addresses that are never emailed, whatever is pressed: `@example.com`, `@example.org`, `@example.net` and `@test.portpass.local` (`lib/email.ts`).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
