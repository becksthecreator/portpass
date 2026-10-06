# Backups and the restore drill

Owner: Antonio. Reviewed after every drill, at least twice a year. First review due 6 January 2027.

## What is backed up, and where

| Copy | Made by | How often | Kept | Holds |
|---|---|---|---|---|
| Supabase's own daily backup | Supabase (Pro plan) | Daily | 7 days (Pro); longer with the Point-in-Time Recovery add-on | The whole project database, including `auth` (accounts) and `storage` metadata |
| Point-in-Time Recovery (PITR) | Supabase, when the add-on is on | Continuous (WAL) | 7 days by default | Any second in the window |
| Off-site encrypted dump | `scripts/backup/backup.sh` on the OptiPlex, 03:15 UTC | Nightly | 30 nightly and 12 monthly copies, age-limited (45 days, 13 months) | `pg_dump` of the whole database, encrypted with `age` to a public key before it touches disk |
| Storage files (photos, logos, exports) | Supabase Storage (S3-backed) | Continuous | With the project | The files; their rows are in the database backups |

**Antonio's clicks, to confirm and tick:** Supabase → Project → Database → Backups: daily backups are listed (☐); the PITR add-on is on, with a 7-day window (☐, Pro plan add-on; the licence asks for it). The OptiPlex log `/var/log/portpass-backup.log` shows last night's `backup ok` (☐).

## How a restore is done

### A. The whole database to a point in time (Supabase)
Use when data was deleted or corrupted and the moment is known.
1. Supabase → Database → Backups → **Point in time** (or **Daily backups** without PITR) → choose the moment → **Restore**. The project is read-only for the duration; Supabase emails when it is done.
2. Redeploy nothing; the code is unchanged. Check Admin → Health (five checks at zero) and Admin → Phase 1.
3. Tell the businesses whose data changed in the lost window (`incident-response.md`, template B).

### B. The off-site dump into a scratch database (the standing drill)
`scripts/backup/restore-test.sh` on the OptiPlex decrypts the newest nightly dump, restores the `public` schema into a fresh local Postgres 17 database, prints row counts for `registrations`, `payments` and `organizations`, and drops the scratch database. It runs on the 1st of each month at 04:00 UTC (`scripts/backup/README.md`) and writes to `/var/log/portpass-backup.log`. **This is the restore drill**: a backup that has never been restored is a hope, not a backup.

### C. The off-site dump into a Supabase branch (the drill the brief asks for)
A Supabase branch is a separate database with the same migrations and no data; restoring the dump into it proves the off-site copy can stand up as a working PortPass without touching production.
1. Supabase → Branches → **Create branch** from `main` (costs apply while it exists). Note its connection string (Connect → Session pooler).
2. On the OptiPlex: `age -d -i portpass-backup-key.txt -o portpass.dump /var/backups/portpass/nightly/<file>.dump.age`, then `pg_restore --schema=public --no-owner --no-privileges --data-only --dbname="<branch connection string>" portpass.dump`, then `shred -u portpass.dump`. Time it.
3. Point a local copy of the site at the branch (`SUPABASE_URL`, `SUPABASE_SECRET_KEY` of the branch, never production's) and open a business page, Admin → Health and Admin → Bookings.
4. Delete the branch. Write the row below.

## Drill log

| Date | Kind | Dump | Time to restore | Rows (registrations / payments / organizations) | Result | Who |
|---|---|---|---|---|---|---|
| 6 Oct 2026 | — | — | — | — | Not yet run from this document. No machine in this session has `pg_restore` or the age key, and the brief's restore into a branch needs the OptiPlex. Antonio runs C once and writes this row; B's monthly runs are in the OptiPlex log. | — |

## Recovery objectives

- **Recovery point:** at most 24 hours of data (the nightly dump), or a few seconds with PITR.
- **Recovery time:** a Supabase point-in-time restore takes minutes to an hour for a database this size; a dump restore into a new project, two to four hours including DNS and keys.
- Both are written here as targets; the drill log is what makes them facts.
