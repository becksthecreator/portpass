-- Round 5, §1: the section list becomes the six sections Antonio set on 27
-- Sept (Services is new), subsections are renamed, reordered or hidden to
-- match, and a business can sit in more than one category
-- (organization_categories) so a photographer is one listing under
-- Weddings → Photo & Video *and* Services → Photo & Video, never two copies.
-- lib/sections.ts mirrors the visible result for the no-database case;
-- db/categories.integration.test.ts fails CI if the two drift apart.

-- ------------------------------------------------------------- new section
insert into public.categories (slug, name, parent_id, template, sort_order) values
  ('services', 'Services', null, 'service', 6)
on conflict (slug) do nothing;

-- ---------------------------------------------------------- new subsections
-- Slugs are unique across the whole table (organizations.subcategory
-- references categories(slug)), so the wedding "Venues" subsection and the
-- services "Photo & Video" subsection carry their own slugs; the name is
-- what people see.
insert into public.categories (slug, name, parent_id, template, sort_order)
select v.slug, v.name, p.id, v.template, v.sort_order
from (values
  ('wedding-venues',    'Venues',                    'weddings', 'venue',   3),
  ('event-venues',      'Event Venues',              'venues',   'venue',   1),
  ('gardens-outdoor',   'Gardens & Outdoor',         'venues',   'venue',   2),
  ('meeting-rooms',     'Meeting Rooms',             'venues',   'venue',   3),
  ('land-tours',        'Land Tours (bikes, jeeps)', 'tours',    'service', 4),
  ('photography',       'Photo & Video',             'services', 'service', 1),
  ('phone-tech-repair', 'Phone & Tech Repair',       'services', 'service', 2)
) as v(slug, name, parent_slug, template, sort_order)
join public.categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- ------------------------------------------------- renames, order, hiding
-- Subsections that left the list are hidden, not deleted: a slug may be
-- referenced by an organization, and a hidden row costs nothing.
update public.categories c
   set name = v.name, sort_order = v.sort_order, is_visible = v.visible
  from (values
    -- Sports & Fitness
    ('football-soccer',       'Football / Soccer',              1, true),
    ('basketball',            'Basketball',                     2, true),
    ('swimming',              'Swimming',                       3, true),
    ('tennis',                'Tennis',                         4, true),
    ('golf',                  'Golf',                           5, true),
    ('sailing',               'Sailing',                        6, true),
    ('strength-conditioning', 'Strength & Conditioning',        7, true),
    ('boxing-martial-arts',   'Boxing & Martial Arts',          8, true),
    ('studios',               'Studios (yoga, pilates, spin)',  9, true),
    ('equestrian',            'Equestrian',                    90, false),
    ('padel',                 'Padel',                         91, false),
    ('volleyball',            'Volleyball',                    92, false),
    -- Weddings
    ('planning',              'Planning',                       1, true),
    ('officiants',            'Officiants',                     2, true),
    ('wedding-venues',        'Venues',                         3, true),
    ('flowers-decor',         'Flowers & Decor',                4, true),
    ('photo-video',           'Photo & Video',                  5, true),
    ('cakes',                 'Cakes',                          6, true),
    ('hair-makeup',           'Hair & Makeup',                  7, true),
    -- Tours
    ('boats',                 'Boats & Charters',               1, true),
    ('fishing-charters',      'Fishing',                        2, true),
    ('food-tours',            'Food & Culture',                 3, true),
    ('land-tours',            'Land Tours (bikes, jeeps)',      4, true),
    ('bikes',                 'Bikes',                         90, false),
    ('jeeps',                 'Jeeps',                         91, false)
  ) as v(slug, name, sort_order, visible)
 where c.slug = v.slug;

-- ------------------------------------------------- organization_categories
-- Every category a business is listed under. The primary one (subcategory
-- when set, else the section) is mirrored here by the trigger below, so
-- section pages, counts and the sitemap read one table; extra categories
-- are added explicitly (db/business.ts setBusinessExtraCategories).
create table if not exists public.organization_categories (
  organization_id bigint not null references public.organizations(id) on delete cascade,
  category_id     bigint not null references public.categories(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (organization_id, category_id)
);
create index if not exists organization_categories_category_idx on public.organization_categories (category_id);
alter table public.organization_categories enable row level security;
revoke all on public.organization_categories from anon, authenticated;

-- Changing the primary moves the mirror row; it never touches rows added
-- as extra categories (unless the new primary is one of them, in which
-- case the two simply coincide).
create or replace function public.organizations_sync_primary_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  new_slug text := coalesce(new.subcategory, new.primary_category);
  old_slug text := case when tg_op = 'UPDATE' then coalesce(old.subcategory, old.primary_category) end;
  new_id bigint;
  old_id bigint;
begin
  if tg_op = 'UPDATE' and old_slug is not null and old_slug is distinct from new_slug then
    select id into old_id from public.categories where slug = old_slug;
    if old_id is not null then
      delete from public.organization_categories where organization_id = new.id and category_id = old_id;
    end if;
  end if;
  if new_slug is not null then
    select id into new_id from public.categories where slug = new_slug;
    if new_id is not null then
      insert into public.organization_categories (organization_id, category_id)
      values (new.id, new_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists organizations_sync_primary_category on public.organizations;
create trigger organizations_sync_primary_category
  after insert or update of primary_category, subcategory on public.organizations
  for each row execute function public.organizations_sync_primary_category();

-- Backfill the mirror for every existing business.
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id
  from public.organizations o
  join public.categories c on c.slug = coalesce(o.subcategory, o.primary_category)
on conflict do nothing;

-- The three businesses we know get their subsection (the trigger moves the
-- mirror). Bahamas Weddings By The Sea officiates and plans, so it is also
-- listed under Planning -- the first "one listing, two categories" row.
update public.organizations set subcategory = 'football-soccer'       where slug = 'futprep'          and subcategory is null;
update public.organizations set subcategory = 'strength-conditioning' where slug = 'carv-performance' and subcategory is null;
update public.organizations set subcategory = 'officiants'            where slug = 'bahamas-weddings' and subcategory is null;
insert into public.organization_categories (organization_id, category_id)
select o.id, c.id from public.organizations o, public.categories c
 where o.slug = 'bahamas-weddings' and c.slug = 'planning'
on conflict do nothing;

-- ------------------------------------------------- interest form categories
-- Mirrors lib/interestCategories.ts -- change both together.
alter table public.interest_submissions drop constraint if exists interest_submissions_category_check;
alter table public.interest_submissions add constraint interest_submissions_category_check
  check (category in (
    'venues', 'events', 'entertainment', 'djs', 'sound-equipment',
    'sports-fitness', 'weddings', 'tours',
    'services', 'photography', 'phone-tech-repair'
  ));
