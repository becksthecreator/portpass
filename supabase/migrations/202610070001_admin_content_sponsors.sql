-- Admin Control Center, build B (brief 08): Content (1.9) and the Sponsors
-- tab of the leads pipeline (1.8).

-- 1. Site content a founder can change without a deploy: the announcement
--    bar and the order of the homepage's "Open now" cards. One row per
--    key; the value's shape is checked in lib/siteContent.ts.
create table if not exists public.site_content (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;

comment on table public.site_content is
  'Founder-editable site content (announcement bar, homepage card order). Server-side reads only; no personal data.';

-- 2. Sponsors: businesses that give PortPass something (a banner, shirts,
--    printing) in return for something (free months, a mention). Business
--    details only, typed by a founder.
create table if not exists public.sponsors (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) > 0),
  item text not null default '',
  value_cents integer check (value_cents is null or value_cents >= 0),
  what_we_give text not null default '',
  status text not null default 'talking' check (status in ('talking', 'agreed', 'delivered', 'ended')),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sponsors enable row level security;
revoke all on public.sponsors from anon, authenticated;

comment on table public.sponsors is
  'Admin -> Leads -> Sponsors: what a sponsor gives, its value, what PortPass gives back, and where it stands.';
