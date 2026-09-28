-- Photo Booths under Entertainment. Antonio added the row live on 28 Sept
-- (id 42, sort 5); seeded here so every environment matches and the
-- compiled mirror in lib/sections.ts can include it.
insert into public.categories (slug, name, parent_id, template, sort_order)
select 'photo-booths', 'Photo Booths', p.id, 'service', 5
  from public.categories p
 where p.slug = 'entertainment'
on conflict (slug) do nothing;

-- Mirrors lib/interestCategories.ts -- change both together.
alter table public.interest_submissions drop constraint if exists interest_submissions_category_check;
alter table public.interest_submissions add constraint interest_submissions_category_check
  check (category in (
    'venues', 'events', 'entertainment', 'djs', 'sound-equipment', 'party-rentals', 'photo-booths',
    'sports-fitness', 'weddings', 'tours',
    'services', 'photography', 'phone-tech-repair'
  ));
