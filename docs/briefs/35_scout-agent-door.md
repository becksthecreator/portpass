# Brief 35: the Scout agent door (13 Oct 2026)

Draft written in a Claude Code session at Antonio's request, then read by the repo's planner and security reviewer; their changes are in. It becomes a brief when Antonio pastes it into a session. The number 35 is the next after brief 34 (child data lock, #217); HQ confirms or renumbers.

## Why

Admin → Leads (PortPass Scout, brief 14) is the catalogue of record: a business's own published details, the Handbook §8 score, the first message a founder sends by hand, and a permanent "do not contact" tombstone that refuses the business forever. Since 12 Oct, Hermes Agent runs on Antonio's laptop as "Scout" (`docs/hermes/`, PR #226). It researches, scores and drafts from Telegram, but it works blind: it cannot ask Admin → Leads whether a business is blocked, and nothing it produces lands in the catalogue until Antonio retypes it. A narrow, token-scoped door fixes both. The door gives an agent business fields and a place to write research. It never gives an agent a phone number, an email, a founder's notes, a status button or a way to send.

Order: PR #226 (`feat/hermes-agent-setup`) merges first. Parts A to C do not need it; part D edits files that exist only on that branch.

## Parts, in build order

### A. The door, and reading a lead

Build a server-only secret, `SCOUT_AGENT_TOKEN`, checked the way `CRON_SECRET` is checked in `lib/cron.ts`: unset means every call is refused with 503 and the log names the setting; wrong or missing means 401; the comparison is constant-time (`lib/sharedSecret.ts`). The gate reads `process.env.SCOUT_AGENT_TOKEN` by that literal name so `lib/env.test.ts` sees it, and `docs/security/env-vars.md` gets its row (optional; 32 or more random letters and digits after the prefix `pps_scout_`; rotated every six months and at once if the laptop is lost or the value was pasted anywhere). `.gitleaks.toml` gains a rule for the `pps_scout_` prefix.

Routes live under `/api/scout/agent/` with the `@public-route` comment. Add `app/api/scout` to `ROOTS` in `lib/auth/guards.static.test.ts` and the routes to `PUBLIC_ROUTES` with the comment "token gate: `scoutAgentGate`". Bodies are read with `readJson` and `bodyOf` and parsed with zod. The door adds no `Access-Control-Allow-*` headers and reads no cookie; it is for a script, not a browser. No door route logs a request body or a header: a refused or failed call logs the route, the status and the lead id only.

Wrong tokens are counted in the database, not in memory: each one is a `security_events` row of a new kind, `scout_token_failed` (the kind list in `202610180003_security_events.sql` is widened in this part's migration); ten in fifteen minutes from anywhere close the door with 429 for fifteen minutes (the only legitimate caller is one laptop, so a lockout only delays Scout); the kind is added to `FAILED_LOGIN_KINDS` so the failed sign-ins alert reports it. The per-address limiter from the enrich route stays as the first line.

Agent calls are capped per Nassau day, counted in the database from `scout_lookups` like the Places cap (`lookupUsage`), at 300 a day unless HQ sets another number, blocked checks included; once the cap is reached every door route answers 429 before it reads anything. Every call is recorded in `scout_lookups` with a new provider value, `agent`, so Admin → Leads shows the count. Every write is an audit row with `actor_user_id` null and an action under `scout.agent.` (`scout.agent.research_written`, `scout.agent.write_refused`, `scout.agent.blocked` when the check answers blocked), with `after` holding `{ actor: "scout-agent", model, lead }` and the caller's address as `logAudit` records it; Admin → Audit lists the new actions in its filter.

Two reads:

- The list: leads in status `new`, `contacted` and `replied`, newest first, at most 25 a page, no "all".
- One lead by id, same fields.

The business fields: id, business name, section, subsection, island, area, what they do, booking method, online payment, prices text, website, Instagram handle (a business's published account; Scout's own blocklist stops it opening Instagram), address, Google Maps link, Google rating and count, score and score reasons, status, source, source URLs, last contact date, the agent's research and when it was made, warm connection. `next_step` and `draft_message` come back through the door only when the agent wrote them last (`enrichment_model` starts with `hermes:`); a founder's own next step or edited draft stays inside Admin → Leads, like notes.

Never through the door, read or write: `phone`, `whatsapp_e164`, `email`, `contact_name`, `notes`, `owner`, `referral_code`, `created_by`, `event_code`, `whatsapp_consent`, `whatsapp_consent_at`, `organization_id`, `application_id`, `dedupe_key`, `match_keys`, and anything from `registrations`, `applications` or any other table. The door selects its own column list (never `LEAD_COLUMNS` or `toLead` then strip), and a unit test reads every `leads` column from the migrations and fails the build if a column is in neither the door's allow list nor the forbidden list, so a column added later is hidden until someone decides.

Data: `leads` (read), `scout_lookups` (provider `agent`), `security_events` (kind `scout_token_failed`), `audit_log` (write).

### B. Writing research, a draft and a next step

Build one write: research for one lead by id. The agent sends what it found (short text), the §8 signals it saw with one reason each, a draft first message, a next step with a date, its model name, its own `research_at` timestamp, and the source URLs. The agent may send the six `AI_SIGNALS` and `posted_recently`; `warm_connection` and `section_we_fill` are the server's whatever the agent sends. The server does the arithmetic with `scoreLead` in `lib/scout/leads.ts` and forces "books by DM" false when "already uses online booking" is true, as `lib/scout/enrich.ts` does. The model name is kept only when it matches `^[a-z0-9.:_-]{3,80}$` and is stored as `hermes:<model>`.

The draft goes through the same check as the AI step's draft (`messageProblem`): a draft that mentions cards or online payment, says "one-stop shop", carries a link or an @account, or runs past the limit is refused with the reason and nothing is stored. Everything else the agent writes that a founder reads is checked too: `next_step`, the research text, each signal reason and each `agent_log` line are refused with the reason if they carry a link, a web address or an @account (the same test as `messageProblem`), and are capped server-side (`next_step` 300 characters, research 1,200, a log line 200, the log 20 lines, oldest dropped). While there, `messageProblem` gains the money words "checkout", "pay now" and "secure payment" (rule 2). Source URLs pass `cleanUrl` (http and https only, twelve at most, merged with the existing list) and the server never fetches one.

Business facts the agent found (what they do, booking method, prices text, section, area) fill only empty fields, exactly as `saveLeadEnrichment` does today: a founder's facts win. The research text and signals go in the existing `enrichment` jsonb as `{ kind: "agent", ... }`. The next step replaces the old one, stored as `By YYYY-MM-DD: text` after the date is validated. The agent's dated line of what it did goes in a new column, `agent_log`, kept apart from a founder's `notes`. A write carries the agent's `research_at` timestamp; a second write with the same timestamp for the same lead is answered 200 with no change, so a retry does not append twice.

The refusal by status is in the write itself: the update runs with `.in("status", ["new", "contacted", "replied"])` and zero rows changed is answered 409, so a status a founder sets between the agent's read and its write is never overwritten. Never through the door: status, contact details, notes, owner, warm connection, "do not contact", removing a lead, drafting a page.

When a lead becomes `do_not_contact`, `agent_log` and the agent's research are wiped with everything else (`DO_NOT_CONTACT_WIPE` in `db/leads.ts`), and the tombstone integration test checks both are null.

Data: `leads` (new column `agent_log`; updates to `enrichment`, `score`, `score_reasons`, `enriched_at`, `enrichment_model`, `next_step`, `draft_message`, `source_urls`, and the empty business fields), `scout_lookups`, `audit_log`.

### C. The blocked check, and the Scout panel on the lead card

Build the blocked check: the agent sends a business name, up to three phone numbers and a website; the answer is one word, `blocked`, `known` or `free`, plus the lead id when it is `known` and in `new`, `contacted` or `replied`. It uses the same `dedupe_key` and hashed `match_keys` as `createLead`, so a "do not contact" business is caught under a slightly different name. The check needs a business name of two or more characters; a call carrying only phone numbers or only a website is refused with 400; the answer never says which key matched. The phone numbers are hashed in memory and never stored or logged; the lookup row records the business name only. Blocked checks count against the daily cap.

On the lead card, add a "Scout" panel: the agent's research text, its signals and reasons, its draft (in the same textarea a founder already edits and copies from), its next step, its log lines, and when and by which model, under the line "Written by Scout from public pages. Check it before you act on it." It renders as plain text, never markdown or HTML. The panel lists which business fields the agent filled, so a founder reads them before "Draft their page" copies `what_they_do` to the draft. "Research and score" (the server's own AI step) stays. In the usage line, count agent calls beside Places and the AI step. "Copy" and "Open in WhatsApp" stay the only ways a message leaves.

Data: `leads` (read of `dedupe_key`, `match_keys`, `status`; read of the agent columns for the card), `scout_lookups`, `audit_log`.

### D. The Hermes side, the docs and the report

Add `docs/hermes/skills/portpass-scout-door/SKILL.md`: `PORTPASS_SCOUT_TOKEN` declared as a required environment variable so Hermes passes it only to this skill; the blocked check before any research; the write after; "Antonio sends" unchanged. The skill sends the token in the `Authorization` header from the environment, never in a URL or the body; on a failed call it reports the status code and the server's `error` text only, never the request or its headers. Antonio types `PORTPASS_SCOUT_TOKEN` into `%LOCALAPPDATA%\hermes\.env` with an editor, never through a PowerShell command, because PSReadLine keeps the command line in its history file. Point `docs/hermes/README.md` (section 6, week 3) at the skill; `apply.ps1` already copies every skill folder. One line in `docs/security/access-control.md` names the door and its rotation. `docs/ops/STATE.md` and the report in the same PR.

Data: none.

## Rules

- **Rule 4.** Nothing is ever sent to a real person by an agent. The door has no send, no email, no WhatsApp link. A write never triggers a message.
- **Rule 5.** Scout drafts; a founder sends by hand in Admin → Leads. The door returns an Instagram handle as a business detail and never a login, a cookie or a feed.
- **Rule 3.** The door reads `leads` only. It never reaches `registrations` or any child's details, and the allow-list test keeps it that way.
- **Rule 2.** The draft check keeps card and online-payment words out of anything the agent writes; the money-word list grows in part B.
- **Rule 6.** `SCOUT_AGENT_TOKEN` and `PORTPASS_SCOUT_TOKEN` are names. The token is minted as `pps_scout_` plus 32 random letters and digits, never appears in a URL, a log line, an audit row, a PowerShell command or the Hermes session history, and is set for **Production only**: a preview shares the live database, so a preview with the same token would let any branch write to the live catalogue; a hand test on a preview uses a throwaway value set for that test and removed after it.
- **Rule 7.** The door cannot draft or publish a page.
- **Migrations.** Number after the highest on `main` (`202610250002` today): part A `202610250003_scout_agent_door.sql` widens the `scout_lookups.provider` check to include `agent` and the `security_events.kind` check to include `scout_token_failed` (as `202610140001_event_signups.sql` widened `source`); part B `202610250004_leads_agent_log.sql` adds `leads.agent_log text check (length(agent_log) <= 4000)`. `LookupProvider`, `lookupUsage` and its two `Record`s in `db/leads.ts` gain `agent`. Each is applied live before the PR's preview is tested.
- **Public repo.** No ids, numbers or names of real businesses in tests or docs; TEST leads only (`@example.com`, `242-555-01xx`).

## PR plan (from the planner, 13 Oct)

Four stacked PRs, each rebased on `origin/main` after a fetch. No Phase 1 run: nothing touches booking, registration, payments or sign-in. `graphify-out/` is untracked and belongs in no PR.

| PR | Branch | Adds | Changes | Migration | Tests | Screenshots |
| --- | --- | --- | --- | --- | --- | --- |
| **Brief 35 (A): the door, and reading a lead** | `feat/scout-agent-door-a` | `lib/scout/agentDoor.ts` (gate, wrong-token counting and lockout, daily cap, `AGENT_LEAD_FIELDS`, the door's own select and mapper), `lib/scout/agentDoor.test.ts`, `app/api/scout/agent/leads/route.ts`, `app/api/scout/agent/leads/[id]/route.ts` | `db/leads.ts` (`LookupProvider` and `lookupUsage` gain `agent`), `lib/alerts.ts` (`FAILED_LOGIN_KINDS`), `app/admin/leads/page.tsx` (usage tile), `app/admin/audit/page.tsx` (actions filter), `docs/security/env-vars.md`, `lib/auth/guards.static.test.ts` (`ROOTS`, `PUBLIC_ROUTES`), `lib/api/body.static.test.ts`, `lib/env.test.ts`, `.gitleaks.toml` | `202610250003_scout_agent_door.sql` | Unit (copy `lib/cron.test.ts`): 503 unset logs the name only, 401 wrong, 429 after ten wrong in fifteen minutes, 200 right, token never logged; the column classification test; integration: list and read on TEST leads, 25 a page, the cap at 300 | 375px `/admin/leads` usage tile showing agent calls |
| **Brief 35 (B): the agent writes research, a draft and a next step** | `feat/scout-agent-door-b` | `app/api/scout/agent/leads/[id]/research/route.ts` (zod body: research, signals with reasons, draft, next step with date, model, `research_at`, source URLs) | `db/leads.ts` (`saveLeadEnrichment` gains next step, agent log line, the status `.in` filter, `agent_log` in `LEAD_COLUMNS` and in `DO_NOT_CONTACT_WIPE`), `lib/scout/agentDoor.ts` (`parseAgentResearch`, `appendAgentLog`), `lib/scout/enrich.ts` (`messageProblem` money words; the link check reused on every agent field) | `202610250004_leads_agent_log.sql` | Unit: `appendAgentLog` drops the oldest lines at the cap; `parseAgentResearch` forces `books_by_dm` false under `online_booking`, refuses drafts and other fields via the link check, redacts with `redactPublicText`; integration: the write fills empty fields only, stores the server score, next step, log line and `hermes:<model>`; refused on `do_not_contact`, `live`, `page_drafted`, `not_now`; a status change between read and write is a 409; the same `research_at` twice is one write; the tombstone wipes `agent_log` and the research; audit row `scout.agent.research_written` with a null actor | none |
| **Brief 35 (C): the blocked check, and the Scout panel on the lead card** | `feat/scout-agent-door-c` | `app/api/scout/agent/check/route.ts` | `db/leads.ts` (`checkLeadBlocked` built on `findExisting`), `lib/scout/agentDoor.ts` (check schema, three-word answer), `app/admin/leads/[id]/LeadCard.tsx` (Scout panel), `scripts/screenshots/seed-staff-fixture.ts`, `scripts/screenshots/capture.mjs` | none | Unit: the answer is exactly `{answer}` or `{answer, leadId}`; name required; phones never reach the lookup query or any log; the panel hides when there is no agent research; integration: a `do_not_contact` TEST lead is blocked under a changed name via `matchKeys`; an open lead is `known` with id; unknown is `free`; the lookup row stores the name only | 375px lead card Scout panel, empty (TEST Swim School) and with research (TEST Party Rentals seeded with `hermes:test-model`) |
| **Brief 35 (D): the Hermes skill, the docs and the report** | `feat/scout-agent-door-d` (after #226) | `docs/hermes/skills/portpass-scout-door/SKILL.md`, `docs/briefs/brief35-scout-agent-door-report.md` | `docs/hermes/README.md` (section 6), `docs/security/access-control.md`, `docs/ops/STATE.md` | none | No app code; CI runs the suite; the skill text is scanned for emails, phone numbers and key-shaped strings | none |

Reused: `bearerToken`, `secretsMatch`, `logRefusedUnset`, `createRateLimiter`, `recordLookup`, `lookupUsage`, `logAudit`, `scoreLead`, `scoreFromEnrichment`, `sectionsWeAreFilling`, `messageProblem`, `redactPublicText`, `saveLeadEnrichment`, `dedupeKey`, `matchKeys`, `findExisting`, `readJson`, `bodyOf`, the card's textarea with Copy and Open in WhatsApp. New: the gate and its counters, the door routes, the column classification test, `agent_log`, the panel, the skill. `middleware.ts` leaves `/api/scout` alone (not in `SESSION_PREFIXES`).

## Report back with

- Files changed, per part.
- Migrations: `202610250003_scout_agent_door.sql`, `202610250004_leads_agent_log.sql`, applied live before each PR's preview is tested.
- Env var names: `SCOUT_AGENT_TOKEN` (Vercel, Production only), `PORTPASS_SCOUT_TOKEN` (Hermes `.env` on the laptop, typed with an editor).
- Tests run: the unit, integration and static tests listed per PR above; the static route list and the env-name test green.
- 375px screenshots: the lead card's Scout panel empty and with research, and the usage line with agent calls. A refused write stores nothing and shows nothing on the card by design, so there is no refused-draft shot; the refusal is the audit row `scout.agent.write_refused`.

## Done when

- [ ] With `SCOUT_AGENT_TOKEN` unset, every door route answers 503 and logs the name.
- [ ] With it set, a wrong token gets 401, ten wrong tokens in fifteen minutes close the door for fifteen minutes, and the failed sign-ins alert reports it.
- [ ] 300 agent calls in a Nassau day and the next one is 429 before any read.
- [ ] The list (25 a page) and the single read return allow-listed business fields only; the classification test proves a new column stays hidden until classified; a founder's own next step and edited draft never come back through the door.
- [ ] A write stores research, signals with reasons, a server-computed score, a dated next step and a log line, fills only empty business fields, and is answered 200 with no change on a retry with the same `research_at`.
- [ ] A draft, next step, research text, reason or log line that carries a link, a web address, an @account or a card or payment word is refused with the reason and nothing is stored.
- [ ] A write to a `do_not_contact`, `live`, `page_drafted` or `not_now` lead is refused in the update itself (409), including a status set between read and write.
- [ ] "Do not contact" wipes `agent_log` and the agent's research with everything else.
- [ ] The blocked check needs a name, answers `blocked`, `known` or `free` and nothing more, never says which key matched, and never stores or logs a phone number.
- [ ] Every call is in `scout_lookups` as `agent`; every write and every blocked answer is an audit row under `scout.agent.` with a null actor and the agent named in `after`; Admin → Audit filters them.
- [ ] The lead card shows the Scout panel as plain text with its warning line and the list of fields the agent filled; "Copy" and "Open in WhatsApp" are the only ways a message leaves.
- [ ] The Hermes skill checks blocked first, writes after, declares the token as a required environment variable, and never prints a request or a header.
- [ ] No Phase 1 run needed; CI green on each PR; the report filed and `docs/ops/STATE.md` updated in PR D.

## For HQ to decide

- The brief number (35 assumed).
- The daily cap (300 proposed) and the lockout (ten wrong tokens in fifteen minutes proposed).
- Whether `replied` leads belong in the agent's list (included, so Scout can draft the next message after Antonio reports a reply).
- Whether a failed-token lockout should also page the founders at once, or only through the hourly failed sign-ins alert.
