-- PortPass Market, Phase 1, part B (brief 25, 6 Oct 2026): the public
-- Market at /market. Search is Postgres ilike over trigram indexes (no
-- outside search service), and two views say, in one place each, what the
-- Market may list:
--
--   market_products     Things to buy: a published product of a verified
--                       seller whose shop is open, on a published, approved
--                       or live business that is not the demo.
--   market_things_to_do Things to do: a published offering of a published
--                       business that is not the demo -- what the business
--                       pages already show -- with whether the business is
--                       also a verified seller ("Made in The Bahamas").
--
-- Both views run with the caller's rights (security_invoker), and the
-- browser roles get nothing: like the tables under them, the server reads
-- them with the service role. Nothing here joins a registration, an
-- attendance record or anything about a child.

create extension if not exists pg_trgm with schema extensions;

create index if not exists products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);
create index if not exists organizations_name_trgm_idx on public.organizations using gin (name extensions.gin_trgm_ops);
create index if not exists offerings_name_trgm_idx on public.offerings using gin (name extensions.gin_trgm_ops);
create index if not exists products_published_newest_idx on public.products (created_at desc, id desc) where is_published;

drop view if exists public.market_products;
create view public.market_products with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.slug,
  p.title,
  p.description,
  p.price_cents,
  p.photos,
  p.market_category,
  p.uses_marks,
  p.licence_kind,
  p.created_at,
  o.slug        as seller_slug,
  o.name        as seller_name,
  o.logo_url    as seller_logo_url,
  o.brand_color as seller_brand_color
from public.products p
join public.organizations o on o.id = p.organization_id
join public.shops s on s.organization_id = p.organization_id
where p.is_published
  and o.is_published
  and not o.is_demo
  and o.status in ('approved', 'live')
  and s.is_published
  and s.seller_status = 'verified';

drop view if exists public.market_things_to_do;
create view public.market_things_to_do with (security_invoker = true) as
select
  f.id,
  f.organization_id,
  f.slug,
  f.type,
  f.name,
  f.summary,
  f.price_cents,
  f.price_unit,
  f.schedule_text,
  f.age_min,
  f.age_max,
  f.age_label,
  f.action_url,
  -- An offering photo is shown only where the business's photos need no
  -- children's-photo consent (the card falls back to the logo otherwise).
  case when o.photo_consent_required then null else f.image_url end as image_url,
  f.created_at,
  o.slug             as org_slug,
  o.name             as org_name,
  o.primary_category as org_category,
  o.logo_url         as org_logo_url,
  o.brand_color      as org_brand_color,
  coalesce(s.is_published and s.seller_status = 'verified', false) as made_in_bahamas
from public.offerings f
join public.organizations o on o.id = f.organization_id
left join public.shops s on s.organization_id = o.id
where f.is_published
  and o.is_published
  and not o.is_demo;

revoke all on public.market_products from anon, authenticated;
revoke all on public.market_things_to_do from anon, authenticated;
grant select on public.market_products to service_role;
grant select on public.market_things_to_do to service_role;
