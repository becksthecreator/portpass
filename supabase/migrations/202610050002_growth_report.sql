-- Futprep growth tracking, parts 2 and 3 (brief 05): the growth report in
-- the business dashboard, the monthly email, and attendance nudges.
--
-- Nothing here holds personal data about a customer. page_events is a
-- count of things that happened on a business's public pages: no name, no
-- contact detail, no account, no IP address, no cookie id.

-- 1. What happened on a business's public pages.
create table if not exists public.page_events (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  -- A public path with nothing personal in it (reference codes and return
  -- links are never recorded; the server cleans the path before saving).
  path text not null,
  event text not null check (event in ('view', 'whatsapp_click', 'register_click', 'register_start')),
  -- How the visitor reached the business, from the first-party attribution
  -- cookie (part 1): the same channels as registrations.source_channel.
  source_channel text not null default 'unknown'
    check (source_channel in ('portpass_listing','portpass_link','qr','instagram','google','whatsapp','referral','member_perk','word_of_mouth','school','other','unknown')),
  created_at timestamptz not null default now()
);

create index if not exists page_events_org_created_idx on public.page_events (organization_id, created_at desc);

alter table public.page_events enable row level security;
revoke all on public.page_events from anon, authenticated;

comment on table public.page_events is
  'Counts for the growth report: views and taps on a business''s public pages, by source. No personal data, no IP address.';

-- Counted in the database: a list of rows is cut off at 1,000 by the API.
create or replace function public.growth_event_counts(p_organization_id bigint, p_from timestamptz, p_to timestamptz)
returns table (event text, source_channel text, events bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select e.event, e.source_channel, count(*)::bigint
    from public.page_events e
   where e.organization_id = p_organization_id
     and e.created_at >= p_from
     and e.created_at < p_to
   group by e.event, e.source_channel;
$$;

revoke all on function public.growth_event_counts(bigint, timestamptz, timestamptz) from public, anon, authenticated;

-- 2. Which businesses are on a commission plan, and on what terms. Empty
-- until a founder adds a row: no fee is ever worked out for invoicing, and
-- no billing event written, for a business that is not listed here.
create table if not exists public.commission_plans (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('grow_with_us')),
  -- 800 = 8%.
  rate_bps integer not null check (rate_bps between 0 and 10000),
  -- The cap for a term is this amount times the months in the term.
  cap_cents_per_month integer not null check (cap_cents_per_month >= 0),
  starts_on date not null,
  ends_on date,
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, kind)
);

alter table public.commission_plans enable row level security;
revoke all on public.commission_plans from anon, authenticated;

comment on table public.commission_plans is
  'A business on a commission plan (Founding Partner "Grow With Us": a share of fees collected from new families PortPass brought, capped per term). Added by a founder once the business agrees.';

-- 3. Fees PortPass has earned, one row per thing that earned them (pricing
-- and billing brief, 2.2). Written for a commission plan today; the same
-- table takes wedding and marketplace fees when billing is built.
create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('grow_with_us_commission', 'wedding_coordination', 'supplier_commission', 'marketplace_commission')),
  source_table text not null,
  source_id bigint not null,
  event_on date not null,
  booking_value_cents integer not null check (booking_value_cents >= 0),
  rate_bps integer not null default 0 check (rate_bps between 0 and 10000),
  flat_cents integer not null default 0 check (flat_cents >= 0),
  fee_cents integer not null check (fee_cents >= 0),
  -- Set when the fee is put on an invoice; an invoiced event is never
  -- changed or removed.
  invoice_line_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, source_table, source_id)
);

create index if not exists billing_events_org_event_idx on public.billing_events (organization_id, event_on desc);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

comment on table public.billing_events is
  'Fees earned per booking: one row per source record, never duplicated. Money in integer cents.';

-- 4. Emails PortPass sent (Admin Control Center 1.10, "Messages log"), so
-- "I never got it" can be answered. Sign-in codes are not logged here. The
-- text of an email is never stored: only who, which template and whether
-- it went.
create table if not exists public.message_log (
  id bigint generated always as identity primary key,
  organization_id bigint references public.organizations(id) on delete set null,
  template text not null,
  recipient text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  -- Why it was skipped or failed, in a few words: never the email's text.
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists message_log_created_idx on public.message_log (created_at desc);

alter table public.message_log enable row level security;
revoke all on public.message_log from anon, authenticated;

comment on table public.message_log is
  'One row per email PortPass tried to send: recipient, template and outcome. Never the body.';

-- 5. A scheduled job claims its period here before it does anything, so
-- running twice (a retry, a second schedule for daylight saving) sends
-- nothing twice.
create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  period_key text not null,
  created_at timestamptz not null default now(),
  unique (job, period_key)
);

alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;

comment on table public.job_runs is
  'One row per job per period (e.g. growth-email / 2026-11): the unique pair is what makes a scheduled job safe to run twice.';
