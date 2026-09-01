# PortPass

PortPass is a Bahamas-based sports management platform for clubs, academies, coaches, parents, and players.

The first production pilot is **Futprep**, beginning with its Saturday **Lil Kickers** and **Rookies** programs.

## Current production stack

- **Next.js** — web application and server API
- **Vercel** — target production hosting
- **Supabase Postgres** — production data layer
- **GitHub** — source of truth
- **GoDaddy** — DNS for `portpassbahamas.com`

The existing ChatGPT Sites deployment remains live only as the current public version until the Vercel/Supabase replacement has been validated and the domain is cut over.

## Futprep Term 1 pilot

### Lil Kickers
- Ages 3–5
- Co-ed
- Saturdays at 9:00 AM
- 20 spots
- BSD $35 weekly
- BSD $300 full term

### Rookies
- Ages 5–7
- Co-ed
- Saturdays at 11:00 AM
- 20 spots
- BSD $45 weekly
- BSD $335 full term

Location: Lyford Cay Lower Campus Soccer Field.

Term 1: September 5–December 5, 2026, with breaks October 10 and October 17.

## Pilot features

- public parent registration
- age/class validation
- class capacity tracking
- emergency, medical, allergy, medication, special-needs and pickup information
- separate photo/video permission
- combined parent/guardian consent and electronic signature
- cash and bank-transfer payment choice
- online payment shown as Coming Soon
- Kiki admin registration/payment workspace
- Coach Bex roster, safety information, attendance and cash-recording workspace
- organization dashboard with programs, locations, coaches, registrations, payments and schedule

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables are documented in `.env.example`.

## Production database

Run:

`supabase/migrations/202609010001_portpass_production.sql`

in the target Supabase project before testing registrations.

See `PRODUCTION_SETUP.md` for the deployment checklist.

## Security

Do not commit:
- Supabase secret keys
- staff PINs or passwords
- production environment files
- parent/player data

The production schema enables row-level security and revokes direct browser-role table access. PortPass server routes use the server-only Supabase secret key for controlled operations.

## CI

Every push to `main` runs a clean production Next.js build through GitHub Actions.
