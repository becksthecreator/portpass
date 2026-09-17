-- Venues for the discovery platform. Nothing on the wedding page (or, later,
-- the broader venue explorer) works without this. wedding_eligible + visibility
-- gate what the public venue explorer can see; partner_contact/commission_*
-- are staff-only and must never be selected in a public query.
create table if not exists public.venues (
  id bigint generated always as identity primary key,
  organization_id bigint references public.organizations(id) on delete set null,
  slug text not null unique,
  name text not null,
  area text,
  short_description text,
  description text,
  hero_image_url text,
  gallery jsonb not null default '[]'::jsonb,
  capacity_min integer,
  capacity_max integer,
  features jsonb not null default '[]'::jsonb,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  base_price_cents integer,
  currency text not null default 'BSD',
  price_basis text check (price_basis in ('per_hour','per_day','per_event','from')),
  booking_mode text not null default 'enquiry'
    check (booking_mode in ('enquiry','request','instant')),
  visibility text not null default 'draft'
    check (visibility in ('draft','unlisted','live')),
  wedding_eligible boolean not null default false,
  categories jsonb not null default '[]'::jsonb,
  -- staff only, never selected in a public query
  partner_contact text,
  availability_notes text,
  commission_rate numeric(5,2),
  commission_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venues_public_idx
  on public.venues (visibility, wedding_eligible) where active;
alter table public.venues enable row level security;
-- No policies, deliberately. Access via server routes on the service role,
-- matching every other table in this database.
