-- Every business needs a directory entry the homepage carousel and category
-- pages can read generically (logo/wordmark, category, brand, hero photo),
-- even when its detail page is built from its own bespoke tables (BWS).
-- logo_url is nullable: no logo on file yet renders as a wordmark tile
-- (see app/_components/blocks/BusinessLogo.tsx) until one is supplied.
alter table public.organizations add column if not exists logo_url text;

-- Deliberately separate from is_published: that flag is guarded by
-- check_organization_publish_requires_priced_offering (an org can't publish
-- its templated page without a priced offering row), which BWS will never
-- have since its detail page is built from the wedding-specific tables, not
-- offerings. is_directory_listed only controls whether an org appears in
-- cross-category surfaces (the homepage carousel, category chips, feature
-- cards) -- it says nothing about whether the org has its own bookable page.
alter table public.organizations add column if not exists is_directory_listed boolean not null default false;

-- Futprep already has a real logo and real session photos sitting unused in
-- public/ from an earlier iteration of the site -- wiring them in here
-- fixes both the "no logos" blocker and the "/sports-fitness has zero
-- images" bug in the same pass.
update public.organizations set
  logo_url = '/futprep-logo.png',
  hero_image_url = '/futprep/lil-kickers/lil-kickers-training.jpg',
  is_directory_listed = true
where slug = 'futprep';

insert into public.organization_images (organization_id, url, alt, sort_order)
select 1, v.url, v.alt, v.sort_order
from (values
  ('/futprep/lil-kickers/lil-kickers-training.jpg', 'Two young Futprep players dribbling a ball under palm trees.', 0),
  ('/futprep/lil-kickers/lil-kickers-group.jpg', 'A group of Futprep players lined up during a Saturday session.', 1),
  ('/futprep/lil-kickers/lil-kickers-coach.jpg', 'The Futprep coaching staff and squad after training.', 2),
  ('/futprep/lil-kickers/lil-kickers-player.jpg', 'A young Futprep player controlling the ball.', 3)
) as v(url, alt, sort_order)
where not exists (select 1 from public.organization_images where organization_id = 1);

-- Bahamas Weddings By The Sea already had a bare organizations row (id=2,
-- not directory-listed, no category/brand/photo) left over from earlier
-- admin work. Filling it in and listing it makes it a real directory entry;
-- its own listing page keeps reading from the wedding-specific tables as
-- before (is_published stays false -- it has no offerings row and never
-- will), this row exists only so the carousel/category-chip/feature-card
-- surfaces can list it generically alongside every future business.
update public.organizations set
  primary_category = 'weddings',
  brand_color = '#c08a5e',
  hero_image_url = '/weddings/bahamas-by-the-sea/hero.jpg',
  one_liner = 'Beachfront wedding ceremonies in Nassau, planned and officiated by Antonio Beckford.',
  is_directory_listed = true
where slug = 'bahamas-weddings';
