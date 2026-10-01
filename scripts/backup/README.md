# PortPass database backups (OptiPlex)

Supabase Pro keeps its own daily backups. These scripts are the **off-site copy**: a nightly `pg_dump` of the whole database, encrypted with [age](https://github.com/FiloSottile/age) to a public key, written to a directory on the OptiPlex with 30 nightly and 12 monthly copies kept.

Nothing secret is committed. The connection string and keys live in `/etc/portpass-backup.env` (mode 600) on the machine, and the dump is encrypted before it touches disk.

## One-time setup

1. **Packages** (Ubuntu/Debian): `sudo apt-get install postgresql-client-17 age`. The client major version must match the server (Supabase runs Postgres 17); `pg_dump --version` should say 17.
2. **Key pair**: `age-keygen -o portpass-backup-key.txt`. It prints the public key (`age1...`). Put the **public key** in the env file as `AGE_RECIPIENT`. Store the **private key file** somewhere that is *not* the backup disk (a password manager entry plus an offline copy). Without it the backups cannot be read — that's the point, so don't lose it.
3. **Env file**: `sudo cp scripts/backup/portpass-backup.env.example /etc/portpass-backup.env && sudo chmod 600 /etc/portpass-backup.env`, then fill in `PORTPASS_DB_URL` (Supabase Dashboard → Connect → *Session pooler* or *Direct*, port 5432), `AGE_RECIPIENT`, `BACKUP_DIR`. The scripts refuse to run if the file isn't mode 600.
4. **Backup directory**: `sudo mkdir -p /var/backups/portpass && sudo chmod 700 /var/backups/portpass`.
5. **First run by hand**: `sudo scripts/backup/backup.sh` → prints `backup ok: /var/backups/portpass/nightly/portpass-YYYYMMDD-HHMM.dump.age (size)`.

## Schedule

`sudo crontab -e`:

```
# PortPass nightly backup, 03:15 UTC
15 3 * * * /opt/portpass/scripts/backup/backup.sh >> /var/log/portpass-backup.log 2>&1
# Monthly restore test, 1st of the month 04:00 UTC
0 4 1 * * /opt/portpass/scripts/backup/restore-test.sh >> /var/log/portpass-backup.log 2>&1
```

Adjust the path to wherever the repo is checked out. Check `/var/log/portpass-backup.log` occasionally; a failing night prints `backup: ...` with the reason.

## Retention

- `nightly/` — newest 30 dumps.
- `monthly/` — the first dump of each month, newest 12.

Pruning by count (the newest 30 nightly and 12 monthly copies) happens at the end of each successful backup. Pruning by age happens at the start of every run, even when the dump then fails: nightly copies older than 45 days and monthly copies older than 13 months are removed, so no copy outlives what the Privacy Policy says.

## Restore test

`restore-test.sh` decrypts the latest nightly dump, restores the `public` schema into a fresh scratch database on a **local** Postgres 17 (`SCRATCH_ADMIN_URL`, e.g. the OptiPlex's own instance — never Supabase), prints row counts for `registrations`, `payments` and `organizations`, and drops the scratch database. It needs `AGE_IDENTITY_FILE` to point at the private key. Expect warnings about Supabase-only extensions; the row counts are what matter.

## Restoring somewhere else (for real, or for a load-test copy)

```bash
age -d -i portpass-backup-key.txt -o portpass.dump /var/backups/portpass/nightly/<file>.dump.age
pg_restore --schema=public --no-owner --no-privileges --dbname="<target connection string>" portpass.dump
shred -u portpass.dump
```

Restoring the `auth` schema (user accounts, once they exist) into another Supabase project needs Supabase's own roles present; do it through the Supabase dashboard's backup restore rather than this dump.

## What not to do

- Don't put `PORTPASS_DB_URL`, the age keys, or a real `.env` anywhere under the repo. `.gitignore` blocks `scripts/backup/*.env`; the example file is the only one that belongs in git.
- Don't run `restore-test.sh` against Supabase (`SCRATCH_ADMIN_URL` is checked for that).
- Don't skip the monthly restore test. A backup that has never been restored is a hope, not a backup.

## Telling PortPass the backup ran (optional)

Admin, Overview shows "Last database backup". It is filled in by the backup
script itself: after each run it calls PortPass and says only "a backup
finished" or "a backup failed". Nothing about the backup travels with it.

1. Make up a long secret of letters and digits (32 or more).
2. In Vercel, add it as `BACKUP_HEARTBEAT_SECRET` and redeploy.
3. In `/etc/portpass-backup.env` on the backup machine, add the same value
   as `HEARTBEAT_SECRET`, and `HEARTBEAT_URL` as in the example file.

The tile turns red if no backup has reported in for 36 hours, or if the
last one failed. Without these two lines the backup runs exactly as before.
