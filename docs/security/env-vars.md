# Settings the server reads (env vars)

Every setting PortPass reads from its environment, by name. This table never holds a value, a key, a PIN or a code (CLAUDE.md, rule 6): values are pasted into Vercel by Antonio, and into Supabase where Supabase needs them. `lib/env.test.ts` fails when the code reads a setting this table does not name, or the table names one the code no longer reads, so what is written here is what runs.

**Required** means a production copy of the site is not whole without it. The server checks the required ones when it starts (`instrumentation.ts`, `lib/env.ts`) and logs the names that are missing. Admin → Settings shows the same facts as switches.

**Rotation** is how often the value is changed when nothing has gone wrong. Any value is changed at once if a person who knew it leaves, if it was pasted anywhere it should not have been, or if the service that issued it says so.

## Set by a person

| Name | Purpose | Who sets it | Rotation |
|---|---|---|---|
| `SUPABASE_URL` | Where the database is. Required. | Antonio, in Vercel (Production and Preview) and in the local stack's shell. | Never; it is the project's address, not a secret. |
| `SUPABASE_SECRET_KEY` | The server's key to the database. Every read and write goes through it, and it signs staff sessions, demo sessions and Member Pass links. Required. | Antonio, in Vercel. Supabase issues it (Project → API keys). | Every 12 months, and at once if it was ever pasted outside Vercel. Supabase lets a new key run beside the old one while Vercel is updated. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Auth: sign-in codes and Google. Not a secret, but read on the server only. Required. | Antonio, in Vercel. Supabase issues it. | Only when Supabase says so. |
| `PLATFORM_OWNER_EMAILS` | Whose first sign-in makes them a platform owner (the founders). Required. | Antonio, in Vercel. | When a founder's address changes. Reviewed in the quarterly access review (`access-control.md`). |
| `RESEND_API_KEY` | Sending email. Required. | Antonio, in Vercel. Resend issues it (API Keys), scoped to sending only. | Every 12 months. |
| `PORTPASS_FROM_EMAIL` | The PortPass sender address, on a domain Resend has verified. Required. | Antonio, in Vercel. | When the sending domain changes. |
| `FUTPREP_FROM_EMAIL` | Futprep's sender address, for parents' emails. Required. | Antonio, in Vercel. | When the sending domain changes. |
| `CRON_SECRET` | Lets Vercel Cron, and nobody else, start the scheduled jobs (`/api/cron/daily`, `/api/cron/attendance-nudge`). Vercel sends it as `Authorization: Bearer <value>` because the variable has this name. Every call is refused with 503 until it is set. Required. | Antonio, in Vercel: 32 or more random letters and digits. | Every 6 months. Change it in Vercel and redeploy; nothing else holds it. |
| `RESEND_WEBHOOK_SECRET` | Checks the Svix signature on Resend's delivery reports (`/api/webhooks/resend`: delivered, bounced, complained, failed). Every call is refused with 503 until it is set. Required. | Antonio, in Vercel. Resend issues it with the webhook (Webhooks → the endpoint → Signing secret, `whsec_…`). | Every 12 months, from Resend's "rotate" button; the route accepts either signature during the change. |
| `BACKUP_HEARTBEAT_SECRET` | Lets the backup machine, and nobody else, report that a nightly backup finished or failed (`/api/heartbeat/backup`). Every call is refused with 503 until it is set. Required. | Antonio, in Vercel, and the same value as `HEARTBEAT_SECRET` in `/etc/portpass-backup.env` on the backup machine (`scripts/backup/README.md`). | Every 6 months, both places on the same day. |
| `AUTH_PHONE_OTP_ENABLED` | `true` switches on sign-in by phone code. Off until Twilio and Meta approve the sender. | Antonio, in Vercel. | Not a secret. |
| `AUTH_PASSKEYS_ENABLED` | `true` offers a passkey after a sign-in. Off while Supabase's support is beta. | Antonio, in Vercel. | Not a secret. |
| `ENTERTAINMENT_NIGHT_HERO` | `1` renders the Entertainment section's hero in the Night theme. | Antonio, in Vercel. | Not a secret. |
| `VERCEL_WEB_ANALYTICS` | `1` renders the Web Analytics tag, once Analytics is enabled on the Vercel project. | Antonio, in Vercel. | Not a secret. |
| `VERCEL_SPEED_INSIGHTS` | `1` renders the Speed Insights tag, on the same condition. | Antonio, in Vercel. | Not a secret. |
| `GOOGLE_SITE_VERIFICATION` | Search Console's site verification token, printed in the page head. | Antonio, in Vercel. | Not a secret; Google issues a new one only if the property is re-verified. |
| `BING_SITE_VERIFICATION` | Bing Webmaster's site verification token, printed in the page head. | Antonio, in Vercel. | Not a secret. |
| `GOOGLE_PLACES_API_KEY` | Admin → Leads: search for businesses with Google Places. Optional. | Antonio, in Vercel. Google Cloud issues it, restricted to the Places API. | Every 12 months. |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Admin → Leads: which Instagram business account the lookup runs as. Optional. | Antonio, in Vercel. | Not a secret. |
| `INSTAGRAM_GRAPH_ACCESS_TOKEN` | Admin → Leads: reads a business's public Instagram profile. Optional. | Antonio, in Vercel. Meta issues it (a long-lived token). | Every 60 days: Meta's long-lived tokens expire. |
| `ANTHROPIC_API_KEY` | Admin → Leads: the AI summary, score and first message to edit. Optional. | Antonio, in Vercel. Anthropic issues it. | Every 12 months. |
| `SCOUT_MODEL` | Which model the Leads summary uses. Optional; there is a default in code. | Antonio, in Vercel. | Not a secret. |
| `WEDDING_DESK_NOTIFY_EMAIL` | Where a new wedding enquiry is emailed. Optional. | Antonio, in Vercel. | When the Wedding Desk's address changes. |

## Set by the host or the runtime

Read by the code, never set by a person.

| Name | Purpose | Who sets it | Rotation |
|---|---|---|---|
| `VERCEL_ENV` | `production`, `preview` or `development`: which copy of the site this is. | Vercel. | None. |
| `VERCEL_GIT_COMMIT_SHA` | Which commit is running, for Admin → Overview. | Vercel. | None. |
| `NODE_ENV` | `production` or `development`. Cookies are marked Secure in production. | Next.js. | None. |
| `NEXT_RUNTIME` | `nodejs` or `edge`: which runtime a file is running in. | Next.js. | None. |

## Only the scripts read these

Not read by the site. Each screenshot and end-to-end script (`scripts/screenshots/*`, `scripts/e2e/*`) reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for the **local** stack it runs against, and refuses or must never be given a production value (`CLAUDE.md`). Their own settings are `SCREENSHOT_BASE_URL`, `SCREENSHOT_FIXTURE`, `SCREENSHOT_PIN` (a TEST PIN, set by the workflow), `PHOTO_DIR` and `LOCAL_MAIL_URL`. The backup machine's `PORTPASS_DB_URL`, `AGE_RECIPIENT`, `AGE_IDENTITY_FILE`, `BACKUP_DIR`, `SCRATCH_ADMIN_URL`, `HEARTBEAT_URL` and `HEARTBEAT_SECRET` live in `/etc/portpass-backup.env` on that machine and are described in `scripts/backup/README.md`.

## Not read any more

`PORTPASS_FUTPREP_ADMIN_PIN`, `PORTPASS_FUTPREP_COACH_PIN`, `PORTPASS_FUTPREP_CEO_PIN`, `PORTPASS_FUTPREP_KIONE_PIN` and `PORTPASS_FUTPREP_ADON_PIN` were the first Futprep staff PINs, set as env vars. Staff accounts and their hashed PINs have lived in the `staff_members` table since the staff accounts work, and no code reads these names. If any of them is still set in Vercel it can be removed.

## What was set on 5 October 2026

Found by the Supabase security advisor and in Vercel on 5 Oct 2026: `CRON_SECRET`, `RESEND_WEBHOOK_SECRET` and `BACKUP_HEARTBEAT_SECRET` were read by code but not set in Vercel. Brief 21 part A made the three routes refuse every call until they are, and asks Antonio to set the three values. Until he does, the daily job, the attendance reminder, Resend's delivery reports and the backup heartbeat are all refused, and Admin → Settings shows each switch off.
