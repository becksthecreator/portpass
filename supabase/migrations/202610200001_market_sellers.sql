-- PortPass Market, Phase 1, part A (brief 25, 6 Oct 2026): sellers.
--
-- Brief 15's tables are all here (shops, products, product_variants,
-- drops, drop_items, reservations, drop_waitlist), so the Market extends
-- them rather than starting again. A seller is a business with a shop row:
-- shops gets the seller's Market status ("Made in The Bahamas" once
-- verified), its seller plan, and how buyers get an order (a pickup note,
-- delivery zones with a fee and a lead time, cash on pickup).
--
-- Nothing is copied:
--   - the business licence number lives where round 5 put it for exactly
--     this, organizations.licences (db/licences.ts), and verifying a seller
--     also marks it checked (licence_verified_at / _by);
--   - the contact person is organizations.primary_contact (what an
--     application's contact person already becomes);
--   - bank details are organization_payment_settings (brief 17).
-- Both organisation columns stay out of every public select (the RLS
-- column grants never included them): only PortPass admins and the
-- business's own owners and admins ever see them. A licence is a number,
-- never a scanned file.
--
-- shops stays owner-only (Brief 21, part B): RLS on, no grants to the
-- browser roles, its restrictive deny policy. The server reads and writes
-- through the service role after lib/auth/guards.ts has said who may.

-- Mirrors lib/market/categories.ts (MARKET_CATEGORIES) -- change both together.
create or replace function public.market_category_valid(slug text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select slug in ('food-drink', 'kits-apparel', 'crafts-gifts', 'home', 'beauty', 'kids', 'events-party', 'services')
$$;

-- Each zone: {"zone": text 1..60, "fee_cents": 0..100000, "lead_days": 0..30}.
-- At most twelve, no zone named twice. Mirrors lib/market/sellers.ts.
create or replace function public.seller_delivery_zones_valid(zones jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(zones) is distinct from 'array' then false
    when jsonb_array_length(zones) > 12 then false
    when exists (
      select 1 from jsonb_array_elements(zones) e
       where jsonb_typeof(e) is distinct from 'object'
          or jsonb_typeof(e->'zone') is distinct from 'string'
          or length(btrim(e->>'zone')) not between 1 and 60
          or jsonb_typeof(e->'fee_cents') is distinct from 'number'
          or jsonb_typeof(e->'lead_days') is distinct from 'number'
    ) then false
    when exists (
      select 1 from jsonb_array_elements(zones) e
       where (e->>'fee_cents')::numeric not between 0 and 100000
          or (e->>'fee_cents')::numeric <> trunc((e->>'fee_cents')::numeric)
          or (e->>'lead_days')::numeric not between 0 and 30
          or (e->>'lead_days')::numeric <> trunc((e->>'lead_days')::numeric)
    ) then false
    else (select count(distinct lower(btrim(e->>'zone'))) = jsonb_array_length(zones) from jsonb_array_elements(zones) e)
  end
$$;

-- ------------------------------------------------------------ the seller
alter table public.shops
  -- none: not on the Market. pending: asked to be verified (from /sell or
  -- the shop page). verified: PortPass checked the licence and the contact
  -- person; the storefront and its products are public. suspended: taken
  -- off the Market by PortPass, with a reason the seller sees.
  add column if not exists seller_status          text not null default 'none',
  add column if not exists seller_verified_at     timestamptz,
  add column if not exists seller_verified_by     uuid references auth.users(id) on delete set null,
  -- The Market seller plan (part C bills it as a PortPass invoice).
  add column if not exists seller_plan            text not null default 'none',
  add column if not exists seller_pickup_note     text not null default '',
  add column if not exists seller_delivery_zones  jsonb not null default '[]'::jsonb,
  add column if not exists accepts_cash_on_pickup boolean not null default false,
  -- What the seller told us when applying.
  add column if not exists market_category        text,
  add column if not exists what_they_sell         text not null default '',
  add column if not exists seller_applied_at      timestamptz,
  add column if not exists seller_status_reason   text;

alter table public.shops drop constraint if exists shops_seller_status_check;
alter table public.shops add constraint shops_seller_status_check check (seller_status in ('none', 'pending', 'verified', 'suspended'));
alter table public.shops drop constraint if exists shops_seller_plan_check;
alter table public.shops add constraint shops_seller_plan_check check (seller_plan in ('none', 'seller'));
alter table public.shops drop constraint if exists shops_seller_pickup_note_length;
alter table public.shops add constraint shops_seller_pickup_note_length check (length(seller_pickup_note) <= 500);
alter table public.shops drop constraint if exists shops_seller_delivery_zones_valid;
alter table public.shops add constraint shops_seller_delivery_zones_valid check (public.seller_delivery_zones_valid(seller_delivery_zones));
alter table public.shops drop constraint if exists shops_market_category_valid;
alter table public.shops add constraint shops_market_category_valid check (market_category is null or public.market_category_valid(market_category));
alter table public.shops drop constraint if exists shops_what_they_sell_length;
alter table public.shops add constraint shops_what_they_sell_length check (length(what_they_sell) <= 500);
alter table public.shops drop constraint if exists shops_seller_status_reason_length;
alter table public.shops add constraint shops_seller_status_reason_length check (seller_status_reason is null or length(seller_status_reason) <= 500);
alter table public.shops drop constraint if exists shops_verified_has_date;
alter table public.shops add constraint shops_verified_has_date check (seller_status <> 'verified' or seller_verified_at is not null);
alter table public.shops drop constraint if exists shops_suspended_has_reason;
alter table public.shops add constraint shops_suspended_has_reason check (seller_status <> 'suspended' or length(btrim(coalesce(seller_status_reason, ''))) > 0);
create index if not exists shops_seller_status_idx on public.shops (seller_status);

-- Each product sits in one Market category (the /market chips).
alter table public.products add column if not exists market_category text;
alter table public.products drop constraint if exists products_market_category_valid;
alter table public.products add constraint products_market_category_valid check (market_category is null or public.market_category_valid(market_category));

-- ------------------------------------------------------- verifying a seller
-- Platform owners only (the route checks). In one transaction, with the
-- business and shop rows locked: refuses the demo business, a suspended
-- business, a business with no shop, a suspended seller (lifting a
-- suspension puts it back in the queue first), and one without a licence
-- number and a contact person on file; then marks the seller verified and
-- the licence checked.
-- Verifying is PortPass's review of a seller, so a draft or submitted
-- business becomes approved; if it already has a published product it goes
-- live (the same rule as a first published product, db/shop.ts).
-- Returns {"went_live": bool}.
create or replace function public.market_verify_seller(p_org bigint, p_actor uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org record;
  v_seller text;
  v_live boolean := false;
begin
  select id, is_demo, status, primary_contact, licences
    into v_org
    from public.organizations
   where id = p_org
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_org.is_demo then
    raise exception 'DEMO' using errcode = 'P0001';
  end if;
  if v_org.status = 'suspended' then
    raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001';
  end if;
  select seller_status into v_seller from public.shops where organization_id = p_org for update;
  if not found then
    raise exception 'NO_SHOP' using errcode = 'P0001';
  end if;
  if v_seller = 'suspended' then
    raise exception 'SELLER_SUSPENDED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(v_org.primary_contact, ''))) = 0 then
    raise exception 'NEEDS_CONTACT' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_org.licences, '[]'::jsonb)) l
     where length(btrim(coalesce(l->>'number', ''))) > 0
  ) then
    raise exception 'NEEDS_LICENCE' using errcode = 'P0001';
  end if;

  update public.shops
     set seller_status = 'verified', seller_verified_at = now(), seller_verified_by = p_actor,
         seller_status_reason = null, updated_at = now()
   where organization_id = p_org;

  update public.organizations
     set licence_verified_at = now(),
         licence_verified_by = p_actor,
         status = case when status in ('draft', 'submitted') then 'approved' else status end,
         approved_at = case when status in ('draft', 'submitted') then now() else approved_at end,
         approved_by = case when status in ('draft', 'submitted') then p_actor else approved_by end
   where id = p_org;

  update public.organizations
     set is_published = true, is_directory_listed = true, status = 'live'
   where id = p_org
     and status = 'approved'
     and not is_published
     and exists (select 1 from public.products where organization_id = p_org and is_published);
  v_live := found;

  return jsonb_build_object('went_live', v_live);
end;
$$;

-- A verification covers the records as they were checked. Changing the
-- licence list or the contact person sends a verified seller back to
-- pending (off the Market until a platform owner checks again).
-- db/licences.ts already clears licence_verified_at on any change.
create or replace function public.organizations_seller_records_changed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.licences, new.primary_contact) is distinct from (old.licences, old.primary_contact) then
    update public.shops
       set seller_status = 'pending', seller_verified_at = null, seller_verified_by = null, updated_at = now()
     where organization_id = new.id
       and seller_status = 'verified';
  end if;
  return null;
end;
$$;

drop trigger if exists organizations_seller_records_changed on public.organizations;
create trigger organizations_seller_records_changed
  after update of licences, primary_contact on public.organizations
  for each row execute function public.organizations_seller_records_changed();

-- Whatever writes the row: a seller becomes verified only with a licence
-- number and a contact person on file, and never the demo business (the
-- same checks as market_verify_seller, which gives the friendlier errors).
-- Leaving 'verified' always clears who verified it and when; leaving
-- 'suspended' clears the reason.
create or replace function public.shops_seller_status_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_was text := null;
begin
  if tg_op = 'UPDATE' then
    v_was := old.seller_status;
  end if;
  if new.seller_status = 'verified' and v_was is distinct from 'verified' then
    if not exists (
      select 1 from public.organizations o
       where o.id = new.organization_id
         and not o.is_demo
         and length(btrim(coalesce(o.primary_contact, ''))) > 0
         and exists (
           select 1 from jsonb_array_elements(coalesce(o.licences, '[]'::jsonb)) l
            where length(btrim(coalesce(l->>'number', ''))) > 0
         )
    ) then
      raise exception 'SELLER_RECORDS_MISSING' using errcode = '23514';
    end if;
  end if;
  if new.seller_status <> 'verified' then
    new.seller_verified_at := null;
    new.seller_verified_by := null;
  end if;
  if new.seller_status <> 'suspended' and v_was is distinct from new.seller_status then
    new.seller_status_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists shops_seller_status_guard on public.shops;
create trigger shops_seller_status_guard
  before insert or update on public.shops
  for each row execute function public.shops_seller_status_guard();

-- Server only: PostgREST exposes public functions as /rpc/*, and Postgres
-- grants EXECUTE to PUBLIC by default.
revoke all on function public.market_category_valid(text) from public, anon, authenticated;
revoke all on function public.seller_delivery_zones_valid(jsonb) from public, anon, authenticated;
revoke all on function public.market_verify_seller(bigint, uuid) from public, anon, authenticated;
grant execute on function public.market_category_valid(text) to service_role;
grant execute on function public.seller_delivery_zones_valid(jsonb) to service_role;
grant execute on function public.market_verify_seller(bigint, uuid) to service_role;

-- ------------------------------------------- the shop's public rows, gated
-- Brief 15 let anyone read a published business's published products and
-- drops. A storefront is now public only once its seller is verified and
-- its shop is open (brief 25, A2-A3), so the browser roles' read policies
-- say what the pages say: published, the business published and not the
-- demo, the shop open, the seller verified. (The pages read with the
-- service role and apply the same rule in db/shop.ts and db/market.ts;
-- this is the second line.)
create or replace function private.market_seller(org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.public_organization(org_id)
     and exists (
       select 1 from public.shops s
        where s.organization_id = org_id and s.is_published and s.seller_status = 'verified'
     )
$$;
revoke all on function private.market_seller(bigint) from public;
grant execute on function private.market_seller(bigint) to anon, authenticated;

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_published and private.market_seller(organization_id));

drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
     where p.id = product_id and p.is_published and private.market_seller(p.organization_id)
  ));

drop policy if exists drops_public_read on public.drops;
create policy drops_public_read on public.drops
  for select to anon, authenticated
  using (status = 'published' and private.market_seller(organization_id));

drop policy if exists drop_items_public_read on public.drop_items;
create policy drop_items_public_read on public.drop_items
  for select to anon, authenticated
  using (exists (
    select 1 from public.drops d
     where d.id = drop_id and d.status = 'published' and private.market_seller(d.organization_id)
  ));

comment on column public.organizations.licences is
  'Array of {type, number, expires_on, document_url}. Never public: PortPass admins, and the business''s own owners and admins on its shop settings (brief 25). document_url is not used: a number is recorded, never a scan.';
