-- Pricing, part 1 of the billing brief (28 Sept): the price list of record
-- as data, so /pricing, /business, /apply, the wizard, the dashboard's
-- plan card and (later) invoices all read one source. Money is integer
-- cents. Both tables are service-role only; the site reads them through
-- db/pricing.ts and the admin edits them through /api/admin/pricing with
-- an audit_log row per change.

create table if not exists public.pricing_plans (
  code                  text primary key,
  name                  text not null,
  kind                  text not null check (kind in ('subscription','commission','per_event','custom')),
  monthly_cents         integer not null default 0 check (monthly_cents >= 0),
  annual_months_charged integer not null default 10 check (annual_months_charged between 1 and 12),
  commission_bps        integer not null default 0 check (commission_bps between 0 and 10000),
  blurb                 text,
  features              jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  badge                 text,
  is_public             boolean not null default true,
  sort                  integer not null default 0,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.pricing_plans enable row level security;
revoke all on public.pricing_plans from anon, authenticated;

create table if not exists public.pricing_addons (
  code         text primary key,
  name         text not null,
  amount_cents integer not null check (amount_cents >= 0),
  unit         text not null check (unit in ('one_time','month','week','item')),
  note         text,
  group_code   text not null default 'addon' check (group_code in ('addon','promote')),
  is_public    boolean not null default true,
  status       text not null default 'adopted' check (status in ('adopted','proposed')),
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.pricing_addons enable row level security;
revoke all on public.pricing_addons from anon, authenticated;

-- Seed (the price list of record). Re-runnable: existing rows are left as
-- the admin may have edited them.
insert into public.pricing_plans (code, name, kind, monthly_cents, commission_bps, blurb, features, badge, is_public, sort) values
  ('solo', 'Solo', 'subscription', 6500, 0, 'One person, one location.',
   '["Unlimited clients and bookings","Booking page","Availability","Client records","Payment requests","Dashboard"]'::jsonb,
   null, true, 1),
  ('growing', 'Growing', 'subscription', 12000, 0, 'Up to 5 staff, 2 locations.',
   '["Unlimited clients and bookings","Booking page","Availability","Client records","Payment requests","Dashboard","Packages","Group sessions and camps","Staff roles","Attendance","Per-staff reporting"]'::jsonb,
   'Most popular', true, 2),
  ('business', 'Business', 'subscription', 22000, 0, 'Unlimited staff and locations.',
   '["Unlimited clients and bookings","Booking page","Availability","Client records","Payment requests","Dashboard","Packages","Group sessions and camps","Staff roles","Attendance","Per-staff reporting","Multi-programme management","Full reporting","Priority support","Custom domain"]'::jsonb,
   null, true, 3),
  ('marketplace', 'Marketplace', 'commission', 0, 800, 'Pay only when PortPass sends you business.',
   '["Booking page","Payment requests","Dashboard"]'::jsonb,
   null, true, 4),
  ('wedding_desk', 'Wedding Desk', 'per_event', 0, 0, 'Bahamas Weddings By The Sea only.',
   '[]'::jsonb, null, false, 9)
on conflict (code) do nothing;

insert into public.pricing_addons (code, name, amount_cents, unit, note, group_code, is_public, status, sort) values
  ('setup',           'Setup & migration',    45000, 'one_time', 'Waived on annual plans',      'addon',   true,  'adopted',  1),
  ('retainer',        'Management retainer',  75000, 'month',    'We run it for you',            'addon',   true,  'adopted',  2),
  ('extra_location',  'Extra location',        2500, 'month',    null,                           'addon',   true,  'adopted',  3),
  ('promote_section', 'Featured in section',   4000, 'month',    null,                           'promote', false, 'proposed', 10),
  ('promote_home',    'Homepage spotlight',   10000, 'week',     null,                           'promote', false, 'proposed', 11),
  ('promote_weekend', 'This Weekend',          2500, 'item',     null,                           'promote', false, 'proposed', 12),
  ('promote_ig',      'Instagram feature',    15000, 'item',     null,                           'promote', false, 'proposed', 13)
on conflict (code) do nothing;

-- The plan someone picked on /pricing before filling in /apply.
alter table public.applications add column if not exists plan_code text references public.pricing_plans(code);
