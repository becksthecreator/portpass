# Class updates (the class feed): report

16 Nov 2026, branch `feat/class-feed`. Part of the dev restart: class feed, then parent home, then vouchers, by 7 Dec.

## What it does
A coach, admin or the CEO picks one class (a programme in a term) on `/futprep/staff/feed`, writes an update and posts it. Each family with a child in that class gets it by email, one email per family, never a shared "To" line. Every update stays on the parents' page `/futprep/feed`. It replaces the per-class WhatsApp groups.

- **Parents:**
  - Sign in to PortPass with the email they registered with (a code, or Google).
  - `/futprep/feed` shows every class their children are in, by first name, with the updates newest first.
  - `/account` links to it when they have a Futprep registration.
- **Who is "in the class":** confirmed places and taster children only (Security & QA, 23 Nov). A pending registration can be made up with any email, so it never sees the feed or gets its emails; waitlisted and cancelled families don't either.
- **Removing an update:** hides it from both pages. A coach removes only their own; an admin or the CEO any. Emails already sent stay sent, and the screen says so before removing.
- **Email cap:** at most 3 emailed updates per class per hour, removed ones counted, so removing and reposting doesn't get round it. Past the cap the coach can still post without email.
- **Helper logins:** can't post.
- **Coach workspace:** gets a "Class updates" link.

## Rules kept
- **Rule 3:** no health, allergy, medication, emergency or pickup column is read, and the integration test checks a health marker never reaches the parents' feed. The posting box warns coaches not to write such details.
- **Rule 4:** tests and screenshots use `@example.com` and `@test.portpass.local` families, which `lib/email.ts` never emails.
- **Rule 5:** no WhatsApp automation. This is the business's own email to its own registered families, one to one.

## Files
- `supabase/migrations/202610280008_class_posts.sql` (new table `class_posts`, RLS on, service role only)
- `lib/classFeed.ts`, `lib/classFeed.test.ts` (rules and the email)
- `db/classFeed.ts`, `db/classFeed.integration.test.ts`
- `app/api/futprep/staff/class-posts/route.ts` (GET list, POST post and email, DELETE remove)
- `app/futprep/staff/feed/` (page, `ClassFeedManager.tsx`, `feed.css`)
- `app/futprep/feed/` (page, `feed.css`)
- `app/futprep/staff/coach/page.tsx` (nav link), `app/account/page.tsx` (link), `lib/auth/middleware.ts` (`/futprep/feed` keeps the session fresh)
- `scripts/screenshots/seed-staff-fixture.ts`, `scripts/screenshots/capture.mjs`, `.github/workflows/staff-screenshots.yml` (two new 375px shots)
- `docs/ops/STATE.md`

## Migrations
`202610280008_class_posts.sql`. It is additive (one new table). It must be applied to the live database before this merges, because previews and production share it.

## Env var names
None new. Uses `RESEND_API_KEY` and `FUTPREP_FROM_EMAIL`.

## Tests
- `npx tsc --noEmit` is clean.
- `npm test` passes: 1098 tests, with the one known Windows-only `lib/weddingWire.test.ts` failure, which also fails on `main`. The guard tests (`futprepGuards.static`, `health.static`, `api/body.static`) pass with the new files.
- `db/classFeed.integration.test.ts` runs in CI against the local stack.
- Lint could not run on this PC (typescript-eslint does not support the installed TypeScript 7). Lint is not in CI.

## Screenshots
From the "Staff screenshots (TEST data)" workflow artifact: `class-feed-staff-375.png` and `class-feed-parent-375.png`.

## Not in this PR
- Photos in posts. That needs the photo-consent rules first.
- Replies from parents.
- Push notifications.
- Sending emails takes about 0.6 s per family, after the response, so a class of 40 is done in under half a minute.
