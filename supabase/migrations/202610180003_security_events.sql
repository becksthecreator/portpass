-- Brief 21, part G: logging and alerting.
--
-- 1. audit_log gains the caller's IP address, so an admin action and a
--    settings change on a business say where they came from as well as who,
--    what and when. Filled in by db/audit.ts from the request; null for a
--    job or a script.
--
-- 2. security_events: one row per thing worth counting but not worth an
--    audit entry: a wrong sign-in code, a wrong staff PIN, a wrong admin
--    authenticator code, an admin sign-in from a device not seen before, a
--    scheduled job refused for a missing secret, a burst of site errors.
--    The address and a few words of detail, never an email address, a PIN
--    or a code. The alerts (lib/alerts.ts) count these; Admin -> Security
--    shows them. Kept 90 days (the daily job prunes).
--
-- 3. admin_devices: which browsers the platform owners have signed in to
--    /admin from, as a hash of the browser's description and the network it
--    came from, with a readable label. A hash not seen before is "a new
--    device", and the founders are emailed.
--
-- Both tables are platform-only: RLS on, no browser-role grant, and the
-- always-false restrictive policy (202610180001), so the checks stay at zero.

alter table public.audit_log add column if not exists ip text;
comment on column public.audit_log.ip is 'Where the action came from (x-forwarded-for, first address). Null for a job or a script.';

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login_failed', 'pin_failed', 'admin_code_failed', 'admin_new_device', 'cron_unset', 'site_errors_spike')),
  ip text,
  detail jsonb,
  created_at timestamptz not null default now()
);
comment on table public.security_events is 'Counted events for the security alerts and Admin -> Security: wrong codes and PINs, new admin devices, a job refused for a missing secret, an error spike. Address and a few words only; never an email, a PIN or a code. Pruned after 90 days.';
create index if not exists security_events_kind_created_idx on public.security_events (kind, created_at desc);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
drop policy if exists security_events_browser_roles_denied on public.security_events;
create policy security_events_browser_roles_denied on public.security_events as restrictive for all to anon, authenticated using (false) with check (false);

create table if not exists public.admin_devices (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  device_hash text not null,
  label text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_hash)
);
comment on table public.admin_devices is 'Browsers the platform owners have passed the admin second step from: a hash of the browser description and network, a readable label, first and last seen. A new hash emails the founders.';

alter table public.admin_devices enable row level security;
revoke all on public.admin_devices from anon, authenticated;
drop policy if exists admin_devices_browser_roles_denied on public.admin_devices;
create policy admin_devices_browser_roles_denied on public.admin_devices as restrictive for all to anon, authenticated using (false) with check (false);
