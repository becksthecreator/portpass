-- Staff PIN sign-in had no limit on wrong attempts (found while checking
-- the privacy policy's "how we protect it" section, 1 Oct 2026). A staff
-- PIN is six digits and is what stands between the internet and the
-- registration desk, so wrong attempts are now counted per account in the
-- database (the in-memory limiters reset whenever a new server instance
-- starts, and there can be several).
--
-- Only the area, the account name typed and the time are stored: no IP
-- address (the privacy policy says we do not save those) and never the PIN.
create table if not exists public.staff_login_attempts (
  id bigint generated always as identity primary key,
  area text not null check (area in ('futprep', 'weddings')),
  account_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_login_attempts_lookup_idx
  on public.staff_login_attempts (area, account_key, created_at desc);

alter table public.staff_login_attempts enable row level security;
revoke all on public.staff_login_attempts from anon, authenticated;

comment on table public.staff_login_attempts is
  'Wrong staff-PIN attempts, per staff area and account name, used to lock an account for 15 minutes after 5 misses. Rows older than a day are pruned on write. No IPs, no PINs.';
