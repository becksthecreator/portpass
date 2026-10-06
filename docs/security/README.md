# PortPass security

How PortPass is kept hard to break into, in one place: what the code enforces, what is switched on by hand in Vercel and Supabase, who owns each part, and when it is reviewed. This folder is the start of the compliance file the Central Bank's systems audit and the Sand Dollar cybersecurity assessment will read.

PortPass holds children's registrations, families' contact details and businesses' payment settings. It never holds money (CLAUDE.md, rule 1).

## The files

| File | What it holds | Owner | Reviewed |
|---|---|---|---|
| `README.md` (this file) | Overview, the sign-in rules, the dashboard switches | Antonio | Quarterly, and after every security brief |
| `env-vars.md` | Every setting the server reads: purpose, who sets it, rotation | Antonio | Quarterly, and whenever a setting is added (`lib/env.test.ts` fails otherwise) |
| `incident-response.md` | Who does what in the first hour; contacts; the notice to affected businesses | Antonio and Adon | Twice a year, with a tabletop run-through |
| `access-control.md` | Roles, what each may do, the joiner and leaver checklist | Antonio | Quarterly |
| `restore-drill.md` | How a backup is restored, and the last drill's time | Antonio | After every drill (at least twice a year) |

Review dates are kept in each file's own header once it exists; the first review of each is due three months after it lands.

## Who may do what

| Who | Signs in with | Session | Second step | Where |
|---|---|---|---|---|
| Customer (a parent, a buyer) | Email code or Google (Supabase Auth) | 30 days since the last visit, renewed on each visit; absolute limit set in Supabase (below) | None | `/account`, their own bookings and the Member Pass |
| Business owner or staff with a PortPass account | The same | The same | None for their own business. Entering another business through the platform role needs the admin second step | `/business/<slug>/…`, their business only |
| Platform owner or admin (the founders) | The same, plus an authenticator app (TOTP) | The sign-in as above; the admin window is 12 hours after the last code | Always. There is no grace period: `/admin` and the platform door to any business open only to a session at AAL2 with a code entered in the last 12 hours (`lib/auth/admin.ts`). A platform account with no authenticator yet is sent to set one up before anything opens | `/admin`, every business |
| Futprep and Wedding Desk staff | Account name and PIN (6 digits or more) | 8 hours, signed server-side; a changed PIN ends every session on the account | None | Their staff screens only |

### The sign-in rules the code enforces

- **Email codes** are issued by Supabase Auth and are single-use. PortPass allows **5 attempts per email per 10 minutes** and 20 per address (`app/api/auth/verify/route.ts`), and 5 code requests per email per 10 minutes (`app/api/auth/send/route.ts`). The code's lifetime is a Supabase setting (below).
- **Staff PINs** are stored hashed in `staff_members.pin_hash`, never in plain text, never in a log and never in an answer (`lib/staffSignIn.test.ts` checks the log and the answers). **5 wrong PINs lock the account name for 15 minutes**, counted in the database so the lock holds across servers (`db/staffLoginAttempts.ts`, tested in `db/staffLoginAttempts.integration.test.ts` and `lib/staffSignIn.test.ts`). A locked account refuses even the right PIN.
- **Sign out everywhere**: My account → Security ends every session on every device at once (`/api/account/sessions`), by deleting the person's sessions server-side, not only the cookie on one device. Admin → People has the same button for a founder to use on anyone's account.
- **Sessions** are cookies the browser cannot read (`httpOnly`, `Secure` in production). The admin window and staff sessions are signed with a key derived from the server's secret, so a cookie cannot be minted or extended in the browser.

## Switched on by hand in Supabase

These are dashboard settings, not code. Antonio makes each change and ticks it here with the date.

| Setting | Where | Value | Why | Done |
|---|---|---|---|---|
| Leaked-password protection | Authentication → Sign In / Providers → Email → "Prevent use of leaked passwords" | On | PortPass has no password sign-in, so this guards a door that is shut; the advisor flags it off, and a licence auditor will read the advisor. | ☐ |
| Email OTP expiry | Authentication → Sign In / Providers → Email → "Email OTP Expiration" | 600 seconds (10 minutes) | A code that lives an hour is guessed at for an hour. | ☐ |
| Time-box user sessions | Authentication → Sessions → "Time-box user sessions" | 30 days | The absolute limit behind the 30-day cookie: a session ends 30 days after sign-in however often it is used. | ☐ |
| Inactivity timeout | Authentication → Sessions → "Inactivity timeout" | 30 days | Matches the cookie. | ☐ |
| Single session per user | Authentication → Sessions → "Single session per user" | Off | A parent is signed in on a phone and a laptop; "Sign out everywhere" is the remedy, not one device. | n/a |
| Multi-factor (TOTP) | Authentication → Multi-Factor | TOTP on | Already on: the admin second step uses it. | ☑ (since the admin sign-in brief) |

## Switched on by hand in Vercel

| Setting | Where | Value | Done |
|---|---|---|---|
| `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `BACKUP_HEARTBEAT_SECRET` | Project → Settings → Environment Variables (Production) | Set (names only here; `env-vars.md`) | ☐ |
| Firewall: Attack Challenge Mode | Project → Firewall → the **Attack Challenge Mode** switch at the top | Off day to day; **on during an incident**, off again when it is over (`incident-response.md`). Every visitor then answers a browser challenge before any page loads. | — |
| Firewall: rate limit `/api/*` | Project → Firewall → **Configure** → **Add rule**: name `API rate limit`; *If* Request Path starts with `/api/`; *Then* **Rate limit**, 200 requests per 60 seconds per IP address, action **Deny** for 60 seconds → Save → **Publish** | Added | ☐ |
| Firewall: rate limit sign-in | The same, a second rule: name `Sign-in rate limit`; *If* Request Path starts with `/login` **or** `/api/auth/`; *Then* **Rate limit**, 30 requests per 60 seconds per IP address, action **Deny** for 300 seconds → Save → **Publish** | Added | ☐ |
| Bot protection | Project → Firewall → **Configure** → **Bot Protection** → Challenge | On | ☐ |

The in-app limits (`lib/auth/rateLimit.ts`) are per server instance; the firewall's hold across all of them and stop a flood before it reaches the code.

## Alerts

Four, each emailed to the platform owners (`PLATFORM_OWNER_EMAILS`) through Resend, at most once an hour per kind, and shown with their last send time in **Admin → Security** (`lib/alerts.ts`, `db/alerts.ts`). Every send is in Admin → Messages as `security_alert_<kind>`. An alert says counts, kinds, addresses and times; never an email address someone typed, a PIN or a code.

| Alert | Fires when | What the email asks for |
|---|---|---|
| Failed sign-ins | 10 or more wrong sign-in codes, staff PINs or admin codes in 10 minutes, from anywhere | Read the addresses in Admin → Security; if it keeps going, Attack Challenge Mode |
| Admin sign-in from a new device | A platform owner passes the admin second step from a browser and network not seen before | If it was not you: sign the account out everywhere (Admin → People), change the authenticator |
| A scheduled job ran without its secret | `/api/cron/*` is called while `CRON_SECRET` is unset (the call was refused) | Set `CRON_SECRET` in Vercel, redeploy |
| Spike in site errors | 20 or more server-side errors in 10 minutes | Admin → Health for the routes, Vercel logs for the detail, roll back if it followed a deploy |

What they count is in `security_events` (kept 90 days) and `admin_devices`; both platform-only. The audit log (`audit_log`) carries the caller's address since 6 Oct 2026, and every admin API call that changes something is in it as `admin.api`, every settings change on a business as `business.settings.api`, beside the richer entries specific actions already wrote.

## What the database enforces

Every public table has row level security on and a policy (`supabase/migrations/202610180001_rls_policies.sql`): the public site's own rows are readable by a browser key, nothing else is, and no browser role can write anywhere. `admin_database_checks()` keeps five counts at zero and CI fails when one moves (`db/adminHealth.integration.test.ts`): tables without RLS, tables with RLS but no policy, tables a browser role could write, functions without a fixed search path, privileged functions a browser could call. Admin → Health shows the same five.

## Where the records are

- **Audit log**: `audit_log`, read in Admin → Audit. Every admin action and settings change on a business, with who, what, before and after.
- **Messages log**: `message_log`, Admin → Messages. Every email PortPass tried to send, never the body.
- **Site errors**: `site_errors`, Admin → Health. Route pattern, error kind and digest only.
- **Sign-in attempts (staff PIN)**: `staff_login_attempts`, pruned after a day.
