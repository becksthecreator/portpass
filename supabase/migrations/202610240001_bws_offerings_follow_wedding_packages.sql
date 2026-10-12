-- Bahamas Weddings By The Sea's prices live in wedding_packages: the
-- Wedding Desk edits them there (/weddings/admin/packages) and its own
-- page and planner read them from there. Its offerings rows are what every
-- generic reader shows instead: the listing page /weddings/bahamas-weddings,
-- the business cards on /weddings/officiants and /weddings/planning, the
-- listing's structured data. Those four rows were copied in by 202609211006
-- and never touched again, so on 11 Oct 2026 they still said Pink Sand
-- $500, Yellow Elder $1,000, Poinciana $2,500 and Hibiscus $3,500 (with
-- "Everything in Poinciana" in it), against $550, $1,100, $2,560 and $1,960
-- on the real page, and Pear and Bronze were missing. The Market reads
-- wedding_packages for BWS directly (202610200002); this fixes the rest.
--
-- From here on each package keeps one offering in step with it: the same
-- slug, name, line, price and inclusions, published exactly while the
-- package is live. A package that is removed, or moved to a new slug,
-- takes its old offering off the page (kept, not deleted, so a booking
-- request or a perk that points at it keeps its row). The photo is the
-- offering's own unless the package has one. action_url sends the button
-- to the planner, and also keeps the generic booking form off these rows
-- (lib/bookings/rules.ts isBookable). Prices are BSD.
create or replace function public.bws_offering_from_wedding_package()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  bws_id bigint;
begin
  select id into bws_id from public.organizations where slug = 'bahamas-weddings';
  if bws_id is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    update public.offerings
       set is_published = false, updated_at = now()
     where organization_id = bws_id and slug = old.slug and is_published;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    update public.offerings
       set is_published = false, updated_at = now()
     where organization_id = bws_id and slug = old.slug and is_published;
  end if;

  insert into public.offerings as o (
    organization_id, type, slug, name, summary, price_cents, price_unit, inclusions,
    image_url, action_url, sort_order, is_featured, is_published
  )
  values (
    bws_id, 'service', new.slug, new.name, new.tagline, new.price_from_cents, 'from',
    case when jsonb_typeof(new.includes) = 'array' then array(select jsonb_array_elements_text(new.includes)) else '{}'::text[] end,
    new.image_url, '/weddings/bahamas-weddings-by-the-sea/plan?tier=' || new.slug,
    new.sort_order, new.is_featured, new.visibility = 'live'
  )
  on conflict (organization_id, slug) do update set
    name = excluded.name,
    summary = excluded.summary,
    price_cents = excluded.price_cents,
    price_unit = excluded.price_unit,
    inclusions = excluded.inclusions,
    image_url = coalesce(excluded.image_url, o.image_url),
    action_url = excluded.action_url,
    sort_order = excluded.sort_order,
    is_featured = excluded.is_featured,
    is_published = excluded.is_published,
    updated_at = now();
  return null;
end;
$$;

drop trigger if exists wedding_packages_to_bws_offerings on public.wedding_packages;
create trigger wedding_packages_to_bws_offerings
  after insert or update or delete on public.wedding_packages
  for each row execute function public.bws_offering_from_wedding_package();

-- Every package through the trigger once: the four old rows take the real
-- prices and inclusions, and Pear and Bronze get their rows. Nothing in
-- wedding_packages itself changes.
update public.wedding_packages set slug = slug;
