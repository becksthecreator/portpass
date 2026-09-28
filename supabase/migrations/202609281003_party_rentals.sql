-- Party Rentals under Entertainment. Antonio added the row live on 28 Sept
-- (id 40, sort 4); it is seeded here so every environment matches and the
-- compiled mirror in lib/sections.ts can include it. The live row is left
-- exactly as it is by the conflict clause.
insert into public.categories (slug, name, parent_id, template, sort_order)
select 'party-rentals', 'Party Rentals', p.id, 'service', 4
  from public.categories p
 where p.slug = 'entertainment'
on conflict (slug) do nothing;

-- The interest form on /entertainment/party-rentals can name the
-- subsection. Mirrors lib/interestCategories.ts -- change both together.
alter table public.interest_submissions drop constraint if exists interest_submissions_category_check;
alter table public.interest_submissions add constraint interest_submissions_category_check
  check (category in (
    'venues', 'events', 'entertainment', 'djs', 'sound-equipment', 'party-rentals',
    'sports-fitness', 'weddings', 'tours',
    'services', 'photography', 'phone-tech-repair'
  ));
