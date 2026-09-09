# PortPass production setup

PortPass is being moved off ChatGPT Sites before Futprep registration goes live.

## Production architecture

- **GitHub:** source of truth — `becksthecreator/portpass`
- **Vercel:** Next.js website and server API routes
- **Supabase:** production Postgres database for organizations, registrations, health/emergency data, payment records, sessions, and attendance
- **GoDaddy:** DNS for `portpassbahamas.com`

The current ChatGPT Sites deployment should remain untouched until Vercel + Supabase has been tested.

## 1. Supabase

Create or select the PortPass Supabase project.

Run:

`supabase/migrations/202609010001_portpass_production.sql`

in the Supabase SQL Editor.

Then collect these values from Supabase project settings:

- Project URL
- Secret key (sb_secret_...)

Do not commit the secret key.

## 2. Vercel

Import the GitHub repository:

`becksthecreator/portpass`

Framework: Next.js.

Add production environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
SUPABASE_SECRET_KEY=<server-only secret key>
```

Staff accounts are not set through environment variables or a fixed list.
The first admin account is created through a one-time setup screen at
`/futprep/lil-kickers/staff/login` (shown whenever no staff account exists
yet); that admin can then create coach/ceo/helper/admin accounts for
everyone else from `/futprep/lil-kickers/staff/accounts`. PINs are stored as
hashes on `staff_members.pin_hash`, keyed by `staff_members.account_key`, so
they can be reset without a redeploy.

Deploy the Vercel preview first. Do not move the custom domain yet.

## 3. Test before domain cutover

Verify:

- landing page
- early-access form
- super-admin review
- Futprep program page
- Futprep Lil Kickers registration
- Futprep Kickers registration
- class capacity
- duplicate prevention
- cash payment selection
- bank-transfer selection
- photo/video yes/no
- combined consent + electronic signature
- first-time admin account setup
- staff login with a created account
- creating a coach/ceo/helper account from Staff accounts
- payment recording
- attendance
- medical/emergency information is visible only in protected staff views

Use test children/data only during validation.

## 4. Domain cutover

After the preview passes:

1. Add `portpassbahamas.com` and `www.portpassbahamas.com` in Vercel.
2. Vercel will provide the DNS records required.
3. Replace only the website-routing records in GoDaddy.
4. Keep unrelated TXT/MX/email records intact.
5. Confirm SSL and both apex/www resolve to Vercel.
6. Remove the obsolete ChatGPT Sites routing records only after Vercel is healthy.

## Security

- Never put Supabase secret keys in GitHub.
- Never put staff PINs in GitHub.
- RLS is enabled and browser roles have direct table access revoked.
- Registration APIs validate program, age, capacity, payment choice, and consent server-side.
- Staff access is server-validated and stored in an HttpOnly, Secure cookie.
- Online card payments remain disabled until a third-party processor is integrated.
