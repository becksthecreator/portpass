-- The shared template system: one Organization + Offering model that every
-- business's public listing renders from, replacing one-off per-brand page
-- designs (pp-*, bws-*, fp-*) with five shared template components reading
-- generic content.
--
-- public.organizations already exists (202609010001, extended in
-- 202609092002) as the operational record behind applications/programs --
-- this adds the marketing/listing columns to that SAME table rather than
-- creating a second "organization" concept. offerings/organization_images/
-- organization_faqs are new: the content each of the five templates reads.

alter table public.organizations
  add column if not exists primary_category text,
  add column if not exists island text,
  add column if not exists area text,
  add column if not exists one_liner text,
  add column if not exists description text,
  add column if not exists years_in_business integer,
  add column if not exists rating numeric(2,1),
  add column if not exists review_count integer,
  add column if not exists awards text[] not null default '{}',
  add column if not exists owner_name text,
  add column if not exists owner_bio text,
  add column if not exists owner_image_url text,
  add column if not exists website_url text,
  add column if not exists hero_image_url text,
  add column if not exists is_published boolean not null default false;

-- One offerings table with a type discriminator, not four tables -- the
-- template picks which columns it needs for the type it's rendering.
create table if not exists public.offerings (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('program', 'event', 'venue', 'service')),
  slug text not null,
  name text not null,
  summary text,
  price_cents integer,
  price_unit text check (price_unit in ('per_session', 'per_term', 'per_hour', 'per_day', 'per_person', 'from')),
  inclusions text[] not null default '{}',
  -- program
  schedule_text text,
  age_min integer,
  age_max integer,
  term_start date,
  term_end date,
  -- event
  event_date date,
  doors_time text,
  ticket_url text,
  -- venue
  capacity integer,
  hourly_rate_cents integer,
  day_rate_cents integer,
  amenities text[] not null default '{}',
  -- service
  lead_time_text text,
  image_url text,
  action_url text,
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
alter table public.offerings enable row level security;
revoke all on table public.offerings from anon, authenticated;

create table if not exists public.organization_images (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  url text not null,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.organization_images enable row level security;
revoke all on table public.organization_images from anon, authenticated;

create table if not exists public.organization_faqs (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.organization_faqs enable row level security;
revoke all on table public.organization_faqs from anon, authenticated;

-- Rule 2, mechanically: an organization cannot be marked published unless it
-- has at least one published offering with a real price. Fires on insert
-- too, which correctly rejects publishing a brand-new org before any
-- offering exists yet -- offerings must be added first.
create or replace function public.check_organization_publish_requires_priced_offering()
returns trigger
language plpgsql
as $$
begin
  if new.is_published and not exists (
    select 1 from public.offerings
    where organization_id = new.id
      and is_published = true
      and price_cents is not null
  ) then
    raise exception 'Cannot publish organization %: no published offering has a price', new.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_publish_requires_priced_offering on public.organizations;
create trigger organizations_publish_requires_priced_offering
  before insert or update of is_published on public.organizations
  for each row
  when (new.is_published = true)
  execute function public.check_organization_publish_requires_priced_offering();

-- Symmetric guard: if the last priced, published offering under a published
-- organization is unpublished, deleted, or has its price cleared, the
-- organization is unpublished automatically rather than left stranded in a
-- state the trigger above would now reject if re-checked.
create or replace function public.unpublish_organization_if_no_priced_offering()
returns trigger
language plpgsql
as $$
declare
  affected_org_id bigint;
begin
  affected_org_id := coalesce(new.organization_id, old.organization_id);
  update public.organizations
  set is_published = false
  where id = affected_org_id
    and is_published = true
    and not exists (
      select 1 from public.offerings
      where organization_id = affected_org_id
        and is_published = true
        and price_cents is not null
    );
  return null;
end;
$$;

drop trigger if exists offerings_unpublish_organization on public.offerings;
create trigger offerings_unpublish_organization
  after update or delete on public.offerings
  for each row
  execute function public.unpublish_organization_if_no_priced_offering();
