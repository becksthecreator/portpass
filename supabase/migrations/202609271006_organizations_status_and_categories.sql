-- Accounts, block 2: sections/subcategories become data (categories), and
-- organizations gain the workflow state and contact/payment fields the
-- owner setup wizard needs.
--
-- status is the workflow (draft -> submitted -> approved -> live, or
-- suspended). is_published / is_directory_listed stay the visibility
-- switches they already are, and the existing "no priced offering, no
-- publish" trigger keeps gating is_published. Going live means setting
-- both status = 'live' and is_published = true in one update.

-- ---------------------------------------------------------------- categories
create table if not exists public.categories (
  id                     bigint generated always as identity primary key,
  slug                   text not null unique,
  name                   text not null,
  parent_id              bigint references public.categories(id) on delete cascade,
  template               text check (template in ('organization','program','service','event','venue')),
  sort_order             integer not null default 0,
  is_visible             boolean not null default true,
  coming_soon_threshold  integer not null default 5,
  created_at             timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories (parent_id, sort_order);
alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;

-- Seed: the nav taxonomy decided 27 Sept. Events is a subsection of
-- Entertainment (not a section); Tours is new. Re-runnable: existing slugs
-- are left exactly as the admin may have since edited them.
insert into public.categories (slug, name, parent_id, template, sort_order) values
  ('sports-fitness', 'Sports & Fitness', null, 'program', 1),
  ('weddings',       'Weddings',         null, 'service', 2),
  ('venues',         'Venues',           null, 'venue',   3),
  ('tours',          'Tours',            null, 'service', 4),
  ('entertainment',  'Entertainment',    null, 'service', 5)
on conflict (slug) do nothing;

insert into public.categories (slug, name, parent_id, template, sort_order)
select v.slug, v.name, p.id, v.template, v.sort_order
from (values
  -- Sports & Fitness
  ('football-soccer',        'Football / Soccer',        'sports-fitness', 'program',  1),
  ('basketball',             'Basketball',               'sports-fitness', 'program',  2),
  ('equestrian',             'Equestrian',               'sports-fitness', 'program',  3),
  ('golf',                   'Golf',                     'sports-fitness', 'program',  4),
  ('padel',                  'Padel',                    'sports-fitness', 'program',  5),
  ('sailing',                'Sailing',                  'sports-fitness', 'program',  6),
  ('strength-conditioning',  'Strength & Conditioning',  'sports-fitness', 'program',  7),
  ('swimming',               'Swimming',                 'sports-fitness', 'program',  8),
  ('tennis',                 'Tennis',                   'sports-fitness', 'program',  9),
  ('volleyball',             'Volleyball',               'sports-fitness', 'program', 10),
  ('boxing-martial-arts',    'Boxing & Martial Arts',    'sports-fitness', 'program', 11),
  ('studios',                'Studios (yoga, pilates, spin)', 'sports-fitness', 'program', 12),
  -- Weddings
  ('planning',               'Planning',                 'weddings', 'service', 1),
  ('officiants',             'Officiants',               'weddings', 'service', 2),
  ('flowers-decor',          'Flowers & Decor',          'weddings', 'service', 3),
  ('photo-video',            'Photo & Video',            'weddings', 'service', 4),
  ('cakes',                  'Cakes',                    'weddings', 'service', 5),
  ('hair-makeup',            'Hair & Makeup',            'weddings', 'service', 6),
  -- Tours
  ('boats',                  'Boats',                    'tours', 'service', 1),
  ('fishing-charters',       'Fishing Charters',         'tours', 'service', 2),
  ('bikes',                  'Bikes',                    'tours', 'service', 3),
  ('jeeps',                  'Jeeps',                    'tours', 'service', 4),
  ('food-tours',             'Food Tours',               'tours', 'service', 5),
  -- Entertainment
  ('events',                 'Events',                   'entertainment', 'event',   1),
  ('djs',                    'DJs',                      'entertainment', 'service', 2),
  ('sound-equipment',        'Sound Equipment',          'entertainment', 'service', 3)
) as v(slug, name, parent_slug, template, sort_order)
join public.categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- ------------------------------------------------------------ organizations
-- A wizard-created business has no application behind it.
alter table public.organizations alter column application_id drop not null;

alter table public.organizations
  add column if not exists status                text not null default 'draft',
  add column if not exists subcategory           text references public.categories(slug) on update cascade on delete set null,
  add column if not exists phone_e164            text,
  add column if not exists whatsapp_e164         text,
  add column if not exists public_email          text,
  add column if not exists instagram_handle      text,
  add column if not exists payment_methods       text[] not null default '{}',
  add column if not exists bank_transfer_details jsonb,
  add column if not exists submitted_at          timestamptz,
  add column if not exists approved_at           timestamptz,
  add column if not exists approved_by           uuid references auth.users(id),
  add column if not exists created_by_admin      boolean not null default false,
  add column if not exists claimed_at            timestamptz;

alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('draft','submitted','approved','live','suspended'));
create index if not exists organizations_status_idx on public.organizations (status);

-- Existing rows: the two published businesses are live; Carv was added by
-- us and isn't public yet.
update public.organizations
   set status = 'live', approved_at = coalesce(approved_at, now())
 where slug in ('futprep','bahamas-weddings') and status = 'draft';
update public.organizations
   set status = 'approved', created_by_admin = true, approved_at = coalesce(approved_at, now())
 where slug = 'carv-performance' and status = 'draft';

-- Keeps status honest when the existing offerings_unpublish_organization
-- trigger (or an admin) flips is_published off: a business that is no
-- longer published is not 'live'.
create or replace function public.organizations_status_follows_unpublish()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_published and not new.is_published and new.status = 'live' then
    new.status := 'approved';
  end if;
  return new;
end;
$$;
drop trigger if exists organizations_status_follows_unpublish on public.organizations;
create trigger organizations_status_follows_unpublish
  before update of is_published on public.organizations
  for each row execute function public.organizations_status_follows_unpublish();
