# Conference load test

`conference.js` is a [k6](https://k6.io) script: ~200 virtual users ramped over 10 minutes, each walking homepage → a section → a business page → the planner or registration page. **GET only** — it never submits a form.

**Never run it against `portpassbahamas.com`.** The script refuses that hostname. It's meant to run from the OptiPlex against a preview deployment that uses its own copy of the database.

## Pass mark

- p95 response time **< 1 s** (`http_req_duration p(95)<1000`)
- **0 failed requests** (`http_req_failed rate==0`)
- Supabase **database connections < 50 %** of the limit throughout — watch Supabase Dashboard → Database → Reports, or run `select count(*) from pg_stat_activity;` during the run and compare with `show max_connections;`.

k6 prints the thresholds as pass/fail at the end. All three must pass.

## 1. Give the preview its own database

Do not point the load test at the production database — the pages read from it on every request.

**Option A — Supabase branch (Pro plan, preferred).** Supabase Dashboard → project → *Branches* → *Create preview branch* (named `loadtest`). Branching needs the GitHub integration enabled once (Dashboard → Integrations → GitHub). The branch gets its own URL and keys under *Branches → loadtest → Connect*.

**Option B — scratch project from a backup.** Create a throwaway Supabase project, then restore the latest backup into it with `pg_restore` (see `scripts/backup/README.md`, "Restoring somewhere else"). Delete the project afterwards.

Either way, copy the branch/scratch project's **URL** and **secret key** — you'll set them in Vercel next.

## 2. A Vercel preview that uses it

1. In the repo: `git checkout -b loadtest && git push -u origin loadtest` (no code changes needed).
2. Vercel → *portpass* → *Settings* → *Environment Variables*: add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` with the branch/scratch values, environment **Preview**, and restrict them to the git branch `loadtest` (the branch selector under the Preview checkbox). Save.
3. Redeploy the `loadtest` branch (Vercel → Deployments → the `loadtest` preview → Redeploy) so it picks the new values.
4. Preview URL: `https://portpass-git-loadtest-port-pass.vercel.app`.
5. Previews are behind Vercel Authentication. Either open it once in your browser and check it loads, then use the bypass: Vercel → *Settings* → *Deployment Protection* → *Protection Bypass for Automation* → generate. Pass it to k6 as `VERCEL_BYPASS`.

Confirm it's the right database before starting: the preview's `/sports-fitness` should show the same businesses, but any test row you add there must **not** appear in the production admin.

## 3. Install and run k6

Ubuntu/Debian (OptiPlex):

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

Run (from the repo root):

```bash
BASE_URL=https://portpass-git-loadtest-port-pass.vercel.app VERCEL_BYPASS=<secret> k6 run scripts/loadtest/conference.js
```

Leave `VERCEL_BYPASS` out if the preview isn't protected. Add `--out json=loadtest-$(date +%F).json` to keep the raw numbers.

## 4. Afterwards

- Read the threshold lines at the bottom of the k6 output; keep the summary in the run log.
- Note the peak connection count from Supabase during the run.
- Delete the Supabase branch / scratch project and the `loadtest` Vercel env vars when done, so nothing keeps costing money or drifting.

## What the numbers mean

- p95 creeping over 1 s on *business* or *action* pages usually means database round-trips per request; the planner and org pages each make several.
- Any non-200 is a failure here — 429s from Vercel or 5xxs from a saturated database both count.
- Connection count is the early warning: Vercel functions each open connections, and Supabase's limit is per plan. Above 50 % at 200 users means the real conference peak (bursty, more users) could hit the ceiling.
