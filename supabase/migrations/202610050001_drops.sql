-- Drops (brief 15, marketplace pilot M1-lite, 1 Oct 2026): merch
-- pre-orders for shops. A customer reserves a size on a drop page; the
-- seller tracks paid and collected from their phone. PortPass never holds
-- money: there is no card payment anywhere, the buyer pays the seller
-- directly (bank transfer or cash) and the seller marks it paid.
--
-- Every table here is server-only, like the rest of the schema: RLS on, no
-- grants to anon/authenticated, all access through the service role in
-- db/shop.ts after lib/auth/guards.ts has said who may do what.

-- ------------------------------------------------------------------- shops
-- One row per business that sells through PortPass: what all of its drops
-- share. A business with no row here has no shop page.
create table if not exists public.shops (
  organization_id  bigint primary key references public.organizations(id) on delete cascade,
  -- Reference codes read KL-7KQ3MX: the shop's own two to four letters.
  reference_prefix text not null unique check (reference_prefix ~ '^[A-Z]{2,4}$'),
  -- Consumer Protection Act: the returns policy is shown on the shop page,
  -- so a shop can't be published without one.
  returns_policy   text not null default '',
  -- How long an unpaid reservation is held before the owner may release it
  -- back to stock (the drop page says so: "held for 48 hours until paid").
  hold_hours       integer not null default 48 check (hold_hours between 1 and 336),
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint shops_publish_needs_returns_policy check (not is_published or length(btrim(returns_policy)) > 0)
);
alter table public.shops enable row level security;
revoke all on public.shops from anon, authenticated;

-- ---------------------------------------------------------------- products
create table if not exists public.products (
  id                  bigint generated always as identity primary key,
  organization_id     bigint not null references public.organizations(id) on delete cascade,
  slug                text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (length(btrim(title)) > 0),
  description         text not null default '',
  price_cents         integer not null check (price_cents > 0),
  -- Public URLs: the business's own photos (organization_images) or a
  -- product photo uploaded to org-assets under org/{id}/product/.
  photos              text[] not null default '{}',
  is_published        boolean not null default false,
  -- §5 marks and crests: a product that uses another organisation's crest,
  -- logo or official kit design needs a licence note and a platform-owner
  -- approval before it can be published. The kind is what the page shows
  -- ("Fan edition" / "Official licensed").
  uses_marks          boolean not null default false,
  licence_kind        text check (licence_kind in ('fan_edition', 'official_licensed')),
  licence_note        text,
  licence_approved_at timestamptz,
  licence_approved_by uuid references auth.users(id) on delete set null,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, slug),
  -- Consumer Protection Act: price and description before reserving.
  constraint products_publish_needs_description check (not is_published or length(btrim(description)) > 0),
  constraint products_marks_need_approved_licence check (
    not is_published or not uses_marks or (
      licence_kind is not null
      and length(btrim(coalesce(licence_note, ''))) > 0
      and licence_approved_at is not null
    )
  )
);
create index if not exists products_org_idx on public.products (organization_id, sort_order);
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;

-- An approval covers the licence as it was approved. Changing the marks
-- flag, the kind or the note withdraws it (and unpublishes a product that
-- uses marks) unless the same update is the approval itself.
create or replace function public.products_licence_needs_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.uses_marks, new.licence_kind, new.licence_note) is distinct from (old.uses_marks, old.licence_kind, old.licence_note)
     and new.licence_approved_at is not distinct from old.licence_approved_at then
    new.licence_approved_at := null;
    new.licence_approved_by := null;
    if new.uses_marks then
      new.is_published := false;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists products_licence_needs_review on public.products;
create trigger products_licence_needs_review
  before update on public.products
  for each row execute function public.products_licence_needs_review();

-- --------------------------------------------------------- product_variants
-- A size or a colourway. stock null means unlimited; otherwise it is what
-- is left to reserve (taken on reserve, given back on cancel or release).
create table if not exists public.product_variants (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 1 and 40),
  stock       integer check (stock is null or stock >= 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, label)
);
create index if not exists product_variants_product_idx on public.product_variants (product_id, sort_order);
alter table public.product_variants enable row level security;
revoke all on public.product_variants from anon, authenticated;

-- ------------------------------------------------------------------- drops
-- A drop opens at opens_at. With followers_first_until set, opens_at is
-- when the private followers' link (/shop/<org>/drop/<slug>?k=<token>)
-- starts working, and followers_first_until is the public open; before
-- that, everyone else sees a countdown. Without it, opens_at is the public
-- open. status: draft (hidden), published (visible; reservable inside the
-- window), closed (the owner ended it early).
create table if not exists public.drops (
  id                    bigint generated always as identity primary key,
  organization_id       bigint not null references public.organizations(id) on delete cascade,
  slug                  text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title                 text not null check (length(btrim(title)) > 0),
  description           text not null default '',
  hero_image_url        text,
  opens_at              timestamptz not null,
  closes_at             timestamptz,
  followers_first_until timestamptz,
  followers_token       text not null default replace(gen_random_uuid()::text, '-', ''),
  -- Consumer Protection Act: the pickup or delivery date is shown before
  -- reserving, so a drop can't be published without it.
  ready_on              date,
  pickup_note           text not null default '',
  delivery_note         text not null default '',
  allow_pickup          boolean not null default true,
  allow_delivery        boolean not null default false,
  delivery_zones        text[] not null default '{}',
  status                text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, slug),
  constraint drops_closes_after_open check (closes_at is null or closes_at > opens_at),
  constraint drops_followers_before_public check (followers_first_until is null or followers_first_until > opens_at),
  constraint drops_some_fulfilment check (allow_pickup or allow_delivery),
  constraint drops_published_needs_date check (status = 'draft' or ready_on is not null)
);
create index if not exists drops_org_idx on public.drops (organization_id, opens_at desc);
alter table public.drops enable row level security;
revoke all on public.drops from anon, authenticated;

create table if not exists public.drop_items (
  drop_id     bigint not null references public.drops(id) on delete cascade,
  product_id  bigint not null references public.products(id) on delete cascade,
  sort_order  integer not null default 0,
  primary key (drop_id, product_id)
);
create index if not exists drop_items_product_idx on public.drop_items (product_id);
alter table public.drop_items enable row level security;
revoke all on public.drop_items from anon, authenticated;

-- ------------------------------------------------------------ reservations
-- items is a snapshot taken at reserve time -- [{variantId, productId,
-- title, label, qty, unitCents}] -- so the itemised receipt stays true if
-- the product is edited later. status says whether the reservation still
-- holds stock: active, or cancelled / released (unpaid past the hold, by
-- the owner, after a confirm; never automatically).
create table if not exists public.reservations (
  id                  bigint generated always as identity primary key,
  reference_code      text not null unique check (reference_code ~ '^[A-Z]{2,4}-[A-Z0-9]{6}$'),
  -- The buyer's receipt link: /shop/<org>/reservation/<token>.
  receipt_token       text not null unique,
  organization_id     bigint not null references public.organizations(id) on delete cascade,
  drop_id             bigint not null references public.drops(id),
  buyer_name          text not null check (length(btrim(buyer_name)) > 0),
  buyer_phone         text not null,
  buyer_email         text,
  items               jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  total_cents         integer not null check (total_cents >= 0),
  payment_method      text not null check (payment_method in ('bank_transfer', 'cash')),
  payment_status      text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  status              text not null default 'active' check (status in ('active', 'cancelled', 'released')),
  fulfilment          text not null check (fulfilment in ('pickup', 'seller_delivery')),
  zone                text,
  delivery_note       text,
  hold_until          timestamptz not null,
  paid_at             timestamptz,
  collected_at        timestamptz,
  cancelled_at        timestamptz,
  -- Where the order came from: a PortPass link or listing, the seller's
  -- Instagram link, or direct. Handbook §5 "Brought by PortPass":
  -- commission applies only to PortPass-brought orders that are paid, so
  -- the evidence is decided by the server at reserve time and never by
  -- the form.
  source              text not null default 'direct' check (source in ('portpass', 'instagram', 'direct')),
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  referrer_host       text,
  commission_eligible boolean not null default false,
  commission_reason   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint reservations_delivery_has_zone check (fulfilment = 'pickup' or zone is not null)
);
create index if not exists reservations_drop_idx on public.reservations (drop_id, created_at desc);
create index if not exists reservations_org_idx on public.reservations (organization_id, created_at desc);
alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;

-- One row per person per sold-out variant.
create table if not exists public.drop_waitlist (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  drop_id          bigint not null references public.drops(id) on delete cascade,
  variant_id       bigint not null references public.product_variants(id) on delete cascade,
  name             text not null check (length(btrim(name)) > 0),
  phone            text not null,
  email            text,
  created_at       timestamptz not null default now(),
  unique (variant_id, phone)
);
create index if not exists drop_waitlist_drop_idx on public.drop_waitlist (drop_id, variant_id);
alter table public.drop_waitlist enable row level security;
revoke all on public.drop_waitlist from anon, authenticated;

-- ------------------------------------------------------ stock, atomically
-- Reserve: lock the variants (in id order, so two buyers can't deadlock),
-- refuse if any is short, take the stock and insert the reservation -- all
-- in one transaction, so a size can never be sold twice. The caller
-- (db/shop.ts) has already checked the drop is open and every variant
-- belongs to it. Raises SOLD_OUT:<variant id> or UNKNOWN_VARIANT.
create or replace function public.shop_create_reservation(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  wanted record;
  wanted_count integer;
  locked_count integer := 0;
  new_id bigint;
begin
  select count(*) into wanted_count
    from (select distinct (e->>'variantId')::bigint from jsonb_array_elements(p->'items') e) d;
  if wanted_count = 0 then
    raise exception 'UNKNOWN_VARIANT' using errcode = 'P0001';
  end if;

  for wanted in
    select pv.id, pv.stock, x.qty
      from (
        select (e->>'variantId')::bigint as variant_id, sum((e->>'qty')::integer) as qty
          from jsonb_array_elements(p->'items') e
         group by 1
      ) x
      join public.product_variants pv on pv.id = x.variant_id
     order by pv.id
     for update of pv
  loop
    locked_count := locked_count + 1;
    if wanted.qty is null or wanted.qty < 1 then
      raise exception 'UNKNOWN_VARIANT' using errcode = 'P0001';
    end if;
    if wanted.stock is not null and wanted.stock < wanted.qty then
      raise exception 'SOLD_OUT:%', wanted.id using errcode = 'P0001';
    end if;
  end loop;
  if locked_count <> wanted_count then
    raise exception 'UNKNOWN_VARIANT' using errcode = 'P0001';
  end if;

  update public.product_variants pv
     set stock = pv.stock - x.qty
    from (
      select (e->>'variantId')::bigint as variant_id, sum((e->>'qty')::integer) as qty
        from jsonb_array_elements(p->'items') e
       group by 1
    ) x
   where pv.id = x.variant_id and pv.stock is not null;

  insert into public.reservations (
    reference_code, receipt_token, organization_id, drop_id,
    buyer_name, buyer_phone, buyer_email, items, total_cents,
    payment_method, fulfilment, zone, delivery_note, hold_until,
    source, utm_source, utm_medium, utm_campaign, referrer_host,
    commission_eligible, commission_reason
  ) values (
    p->>'reference_code', p->>'receipt_token', (p->>'organization_id')::bigint, (p->>'drop_id')::bigint,
    p->>'buyer_name', p->>'buyer_phone', nullif(p->>'buyer_email', ''), p->'items', (p->>'total_cents')::integer,
    p->>'payment_method', p->>'fulfilment', nullif(p->>'zone', ''), nullif(p->>'delivery_note', ''), (p->>'hold_until')::timestamptz,
    coalesce(p->>'source', 'direct'), p->>'utm_source', p->>'utm_medium', p->>'utm_campaign', p->>'referrer_host',
    coalesce((p->>'commission_eligible')::boolean, false), p->>'commission_reason'
  )
  returning id into new_id;

  return jsonb_build_object('id', new_id);
end;
$$;

-- Cancel or release: give the stock back and mark the reservation, once.
-- p_only_expired (the owner's "Release now?") also requires it to be
-- unpaid and past its hold at this moment, whatever the page showed.
-- Never touches a collected reservation. Returns whether it changed.
create or replace function public.shop_release_reservation(p_id bigint, p_status text, p_only_expired boolean)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  released_items jsonb;
begin
  if p_status not in ('cancelled', 'released') then
    raise exception 'BAD_STATUS' using errcode = 'P0001';
  end if;
  update public.reservations
     set status = p_status, cancelled_at = now(), updated_at = now()
   where id = p_id
     and status = 'active'
     and collected_at is null
     and payment_status <> 'paid'
     and (not p_only_expired or (payment_status = 'pending' and hold_until < now()))
  returning items into released_items;
  if not found then
    return false;
  end if;
  update public.product_variants pv
     set stock = pv.stock + x.qty
    from (
      select (e->>'variantId')::bigint as variant_id, sum((e->>'qty')::integer) as qty
        from jsonb_array_elements(released_items) e
       group by 1
    ) x
   where pv.id = x.variant_id and pv.stock is not null;
  return true;
end;
$$;

-- Server only: PostgREST exposes public functions as /rpc/*, and Postgres
-- grants EXECUTE to PUBLIC by default.
revoke all on function public.shop_create_reservation(jsonb) from public, anon, authenticated;
revoke all on function public.shop_release_reservation(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.shop_create_reservation(jsonb) to service_role;
grant execute on function public.shop_release_reservation(bigint, text, boolean) to service_role;

-- ------------------------------------------- publishing a shop-only business
-- "No priced offering, no publish" (template system, rule 2) predates
-- shops: a business that only sells products has nothing in offerings. A
-- published product (always priced, price_cents > 0) now counts too, and
-- the symmetric unpublish guard watches both tables.
create or replace function public.check_organization_publish_requires_priced_offering()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_published
     and not exists (
       select 1 from public.offerings
        where organization_id = new.id and is_published = true and price_cents is not null
     )
     and not exists (
       select 1 from public.products
        where organization_id = new.id and is_published = true
     ) then
    raise exception 'Cannot publish organization %: no published offering or product has a price', new.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.unpublish_organization_if_no_priced_offering()
returns trigger
language plpgsql
set search_path = public, pg_temp
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
    )
    and not exists (
      select 1 from public.products
      where organization_id = affected_org_id
        and is_published = true
    );
  return null;
end;
$$;

drop trigger if exists products_unpublish_organization on public.products;
create trigger products_unpublish_organization
  after update or delete on public.products
  for each row
  execute function public.unpublish_organization_if_no_priced_offering();

-- --------------------------------------------------- Shop Bahamian section
-- §4: a new section with one subsection. It reads "Coming soon" under the
-- existing section rules until three shops are live (the threshold below,
-- editable in Admin -> Sections). Placed after the last section, whatever
-- the admin has added live since. lib/sections.ts mirrors it.
insert into public.categories (slug, name, parent_id, template, sort_order, coming_soon_threshold)
select 'shop', 'Shop Bahamian', null, 'service', coalesce(max(sort_order), 0) + 1, 3
  from public.categories
 where parent_id is null
on conflict (slug) do nothing;

insert into public.categories (slug, name, parent_id, template, sort_order, coming_soon_threshold)
select 'apparel-merch', 'Apparel & Merch', p.id, 'service', 1, 3
  from public.categories p
 where p.slug = 'shop'
on conflict (slug) do nothing;

-- Mirrors lib/interestCategories.ts -- change both together.
alter table public.interest_submissions drop constraint if exists interest_submissions_category_check;
alter table public.interest_submissions add constraint interest_submissions_category_check
  check (category in (
    'venues', 'events', 'entertainment', 'djs', 'sound-equipment', 'party-rentals', 'photo-booths',
    'sports-fitness', 'weddings', 'tours',
    'services', 'photography', 'phone-tech-repair',
    'shop', 'apparel-merch'
  ));
