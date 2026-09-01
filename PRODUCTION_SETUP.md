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
- Service role key

Do not commit the service role key.

## 2. Vercel

Import the GitHub repository:

`becksthecreator/portpass`

Framework: Next.js.

Add production environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
PORTPASS_FUTPREP_ADMIN_PIN=<Kiki staff PIN>
PORTPASS_FUTPREP_COACH_PIN=<Coach Bex staff PIN>
```

Deploy the Vercel preview first. Do not move the custom domain yet.

## 3. Test before domain cutover

Verify:

- landing page
- early-access form
- super-admin review
- Futprep program page
- Lil Kickers registration
- Rookies registration
- class capacity
- duplicate prevention
- cash payment selection
- bank-transfer selection
- photo/video yes/no
- combined consent + electronic signature
- Kiki staff login
- Coach Bex staff login
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

- Never put Supabase service-role keys in GitHub.
- Never put staff PINs in GitHub.
- RLS is enabled and browser roles have direct table access revoked.
- Registration APIs validate program, age, capacity, payment choice, and consent server-side.
- Staff access is server-validated and stored in an HttpOnly, Secure cookie.
- Online card payments remain disabled until a third-party processor is integrated.
