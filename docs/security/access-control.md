# Access control

Owner: Antonio. Reviewed quarterly (the access review below). First review due 6 January 2027.

## Roles in PortPass

Roles come from the database (`profiles.platform_role`, `organization_members.role`, `staff_members.role`), never from the browser; every page and route checks them server-side (`lib/auth/guards.ts`, `lib/auth/guards.static.test.ts` fails the build if one does not).

| Role | Who | May | May not | Second step |
|---|---|---|---|---|
| `platform_owner` | The founders | Everything in `/admin`; grant `platform_admin`; every business through the platform door | See a child's health details through the platform door (only a business's own membership with the team permission can) | Authenticator code, every 12 hours |
| `platform_admin` | PortPass staff, when there are any | `/admin` and every business through the platform door, as above | Grant roles | The same |
| `org_owner` | The business owner | Everything about their business: page, team, bank details, payments, registrations | Other businesses | None |
| `org_admin` | Someone the owner trusts | The same, except changing the owner | — | None |
| `org_staff` | Staff | Day-to-day: registrations, bookings, attendance, payments if given the payments permission; health details only with the team permission | Settings, team, bank details | None |
| `org_viewer` | Read-only | See | Change | None |
| Futprep staff: `admin`, `ceo`, `coach`, `helper` | Futprep's own team, by account name and PIN | Their staff screens (`/futprep/staff/*`); `admin` and `ceo` manage accounts and payments; a `coach` sees their own sessions' roster | Anything outside Futprep | None; 8-hour session; 5 wrong PINs lock the account 15 minutes |
| Wedding Desk staff | Bahamas Weddings' team, by account name and PIN | `/weddings/staff/*` and `/weddings/admin/*` | Anything outside the wedding site | The same |
| Customer | A parent, a buyer | Their own account page, bookings, Member Pass | Anything else | None |
| Demo session | Anyone, on `/demo` | The demo business only; nothing is sent | The real data | None |

PortPass Market sellers (brief 25): a business's licence number and contact person (`organizations.licences`, `primary_contact`) are never public. They are seen by that business's own `org_owner` and `org_admin` (the PortPass Market block on its shop page) and by `platform_owner` and `platform_admin` (Admin -> Market -> Sellers). Only a `platform_owner` verifies or suspends a seller, after the second step, and verifies only the records shown on screen when the button was pressed.

## Accounts outside the app

| Account | Who holds it | Guards |
|---|---|---|
| Vercel (project owner) | Antonio | Vercel's own 2FA on; secrets pasted here only |
| Supabase (project owner) | Antonio | Supabase's own 2FA on; keys never leave the dashboard except into Vercel |
| Resend | Antonio | 2FA on; a sending-only API key |
| GitHub (repository owner) | Antonio | 2FA on; push protection and secret scanning on; Dependabot |
| Google Cloud (Places key), Meta (Instagram token), Anthropic (Scout key) | Antonio | Keys restricted to their one API; rotation in `env-vars.md` |
| The OptiPlex backup machine | Antonio | `/etc/portpass-backup.env` mode 600; the age private key kept off the machine |
| Claude Code sessions | A founder, on their own machine | Never given a production key; TEST data only (CLAUDE.md rules 4 and 6) |

## Joiner checklist

1. Which role, for which business, and why. Write it in the Beckford HQ project.
2. **A business team member:** the owner invites them from their business area (an email invitation, 14 days, one use). They sign in with a code; the role is on the membership. Health details need the team permission, given separately and only when the job needs it.
3. **Futprep or Wedding Desk staff:** an admin makes the account on the staff screen with a first PIN of six digits or more, told in person; they change it on first sign-in.
4. **A platform admin:** `platform_owner` grants it in Admin → People. They set up an authenticator before `/admin` opens.
5. **An outside account** (Vercel, Supabase, GitHub): invite with the least role that does the job; 2FA before anything else.

## Leaver checklist

Same day, in this order:
1. **End their sessions:** Admin → People → sign out everywhere (or, for staff, deactivate the account, which ends its sessions since the role is part of what is signed).
2. **Remove the role:** the membership, the staff account (deactivate, do not delete: history refers to it), the platform role.
3. **Rotate what they knew:** any shared secret they had seen (`env-vars.md`: `CRON_SECRET`, `BACKUP_HEARTBEAT_SECRET`, the Resend key if they had the dashboard), the Wi-Fi of the backup machine if they had been on it.
4. **Outside accounts:** remove from Vercel, Supabase, GitHub, Resend the same day.
5. Write the date in the Beckford HQ project.

## The quarterly access review

Every quarter Antonio reads, and writes the date in the Beckford HQ project:
- Admin → People: every platform role is a current founder or staff member.
- Each live business's team (Admin → Businesses): every member still works there (ask the owner); every team permission is still needed.
- Futprep and Wedding Desk staff accounts: every active account is a current staff member.
- Vercel, Supabase, GitHub, Resend members: the same.
- `env-vars.md`: every rotation that was due has happened.
