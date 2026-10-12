-- PortPass Market, Phase 1, part C (brief 25, 6 Oct 2026): orders through
-- payment requests, and PortPass's own Market fees.
--
-- Orders are brief 15's reservations, extended in place rather than
-- renamed: a reservation now has a kind, 'drop' (reserved on a drop page,
-- exactly as before) or 'order' (ordered from the Market or a storefront,
-- outside any drop). The Drops admin, the stock functions, the payment
-- request link (payment_requests.reservation_id) and the demo reset keep
-- working unchanged. A view, public.orders, gives the Market's orders the
-- shape the brief names (status, brought_by_portpass, payment_request_id).
--
-- PortPass never holds money: every order gets a payment request from the
-- seller to the buyer (brief 17); the buyer pays the seller directly by
-- bank transfer or cash and the seller marks it paid. PortPass's own fees
-- (the seller plan and 8% of what PortPass brought) are PortPass invoices
-- in the existing billing, drafted by the daily job and only once
-- market_settings.fees_live is on; until then the job only logs amounts.
--
-- Owner-only and platform-only like everything else (Brief 21, part B):
-- RLS on, no browser grants, a restrictive deny policy.

-- ------------------------------------------------------------ market_settings
-- One row. The prices are Antonio's to confirm before launch: fees_live
-- stays off (a dry run) until he does.
create table if not exists public.market_settings (
  id                boolean primary key default true check (id),
  seller_plan_cents integer not null default 2900 check (seller_plan_cents between 0 and 1000000),
  commission_bps    integer not null default 800 check (commission_bps between 0 and 10000),
  fees_live         boolean not null default false,
  fees_live_since   date,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
insert into public.market_settings (id) values (true) on conflict (id) do nothing;

-- The Seller plan's start: a month's plan fee is billed only to a seller who
-- was on the plan before that month began, so putting a seller on the plan
-- never bills a month already gone.
alter table public.shops add column if not exists seller_plan_since timestamptz;

-- ------------------------------------------------------- reservations: orders
alter table public.reservations alter column drop_id drop not null;
alter table public.reservations
  add column if not exists kind               text not null default 'drop',
  -- The order's own steps (orders only; a drop reservation keeps 'new').
  add column if not exists order_status       text not null default 'new',
  add column if not exists subtotal_cents     integer,
  add column if not exists delivery_fee_cents integer not null default 0,
  add column if not exists payment_request_id bigint references public.payment_requests(id) on delete set null,
  add column if not exists confirmed_at       timestamptz,
  add column if not exists ready_at           timestamptz,
  add column if not exists delivered_at       timestamptz,
  -- The Market invoice that charged commission on this order, once one has:
  -- an order is never charged twice (paid again in a later month after a
  -- refund), and a refund after invoicing shows on Admin -> Market -> Income.
  add column if not exists market_invoice_id  bigint references public.portpass_invoices(id) on delete set null;

alter table public.reservations drop constraint if exists reservations_kind_check;
alter table public.reservations add constraint reservations_kind_check check (kind in ('drop', 'order'));
alter table public.reservations drop constraint if exists reservations_kind_has_drop;
alter table public.reservations add constraint reservations_kind_has_drop check ((kind = 'drop') = (drop_id is not null));
alter table public.reservations drop constraint if exists reservations_order_status_check;
alter table public.reservations add constraint reservations_order_status_check check (order_status in ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'collected', 'cancelled'));
alter table public.reservations drop constraint if exists reservations_order_amounts;
alter table public.reservations add constraint reservations_order_amounts check (
  kind = 'drop' or (subtotal_cents is not null and subtotal_cents >= 0 and delivery_fee_cents >= 0 and total_cents = subtotal_cents + delivery_fee_cents)
);
create index if not exists reservations_orders_idx on public.reservations (organization_id, created_at desc) where kind = 'order';
create index if not exists reservations_payment_request_idx on public.reservations (payment_request_id) where payment_request_id is not null;
create index if not exists reservations_market_invoice_idx on public.reservations (market_invoice_id) where market_invoice_id is not null;

-- One row per line of an order: which size, how many, at what price (the
-- snapshot in reservations.items stays the receipt).
create table if not exists public.order_items (
  id             bigint generated always as identity primary key,
  reservation_id bigint not null references public.reservations(id) on delete cascade,
  product_id     bigint references public.products(id) on delete set null,
  variant_id     bigint references public.product_variants(id) on delete set null,
  title          text not null,
  label          text not null,
  qty            integer not null check (qty between 1 and 10),
  unit_cents     integer not null check (unit_cents >= 0)
);
create index if not exists order_items_reservation_idx on public.order_items (reservation_id);
create index if not exists order_items_variant_idx on public.order_items (variant_id);

-- The brief's shape for a Market order, over the same rows.
drop view if exists public.orders;
create view public.orders with (security_invoker = true) as
select
  r.id,
  r.reference_code,
  r.organization_id,
  r.buyer_name,
  r.buyer_phone,
  r.buyer_email,
  r.items,
  r.subtotal_cents,
  r.delivery_fee_cents,
  r.total_cents,
  r.fulfilment,
  r.zone,
  r.order_status        as status,
  r.payment_request_id,
  r.payment_method,
  r.payment_status,
  r.source,
  r.utm_source,
  r.utm_medium,
  r.utm_campaign,
  r.commission_eligible as brought_by_portpass,
  r.hold_until,
  r.created_at,
  r.updated_at,
  r.confirmed_at,
  r.ready_at,
  r.paid_at,
  r.delivered_at,
  r.collected_at,
  r.cancelled_at
from public.reservations r
where r.kind = 'order';

-- ------------------------------------------------------ placing an order
-- Like shop_create_reservation (Drops): lock the variants in id order,
-- refuse if any is short, take the stock, insert the order and its lines,
-- all in one transaction, so a size can never be sold twice. The caller
-- (db/marketOrders.ts) has already checked the product is on the Market
-- and priced every line from the database. Raises SOLD_OUT:<variant id> or
-- UNKNOWN_VARIANT.
create or replace function public.market_create_order(p jsonb)
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
      join public.products pr on pr.id = pv.product_id and pr.organization_id = (p->>'organization_id')::bigint and pr.is_published
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
    kind, reference_code, receipt_token, organization_id, drop_id,
    buyer_name, buyer_phone, buyer_email, items, subtotal_cents, delivery_fee_cents, total_cents,
    payment_method, fulfilment, zone, delivery_note, hold_until,
    source, utm_source, utm_medium, utm_campaign, referrer_host,
    commission_eligible, commission_reason
  ) values (
    'order', p->>'reference_code', p->>'receipt_token', (p->>'organization_id')::bigint, null,
    p->>'buyer_name', p->>'buyer_phone', nullif(p->>'buyer_email', ''), p->'items',
    (p->>'subtotal_cents')::integer, (p->>'delivery_fee_cents')::integer, (p->>'total_cents')::integer,
    p->>'payment_method', p->>'fulfilment', nullif(p->>'zone', ''), nullif(p->>'delivery_note', ''), (p->>'hold_until')::timestamptz,
    coalesce(p->>'source', 'direct'), p->>'utm_source', p->>'utm_medium', p->>'utm_campaign', p->>'referrer_host',
    coalesce((p->>'commission_eligible')::boolean, false), p->>'commission_reason'
  )
  returning id into new_id;

  insert into public.order_items (reservation_id, product_id, variant_id, title, label, qty, unit_cents)
  select new_id, (e->>'productId')::bigint, (e->>'variantId')::bigint, e->>'title', e->>'label', (e->>'qty')::integer, (e->>'unitCents')::integer
    from jsonb_array_elements(p->'items') e;

  return jsonb_build_object('id', new_id);
end;
$$;

revoke all on function public.market_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.market_create_order(jsonb) to service_role;

-- ------------------------------------------------------------ server only
alter table public.market_settings enable row level security;
alter table public.order_items enable row level security;
revoke all on public.market_settings from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to service_role;
do $$
declare
  t text;
begin
  foreach t in array array['market_settings', 'order_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_browser_roles_denied', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t || '_browser_roles_denied', t
    );
  end loop;
end $$;

-- ------------------------------------------------ a cancelled order's step
-- shop_release_reservation (brief 15) marks a reservation cancelled or
-- released and gives its stock back, once; an order's own step follows it
-- in the same update, so the two can never disagree.
create or replace function public.reservations_order_cancelled()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'order' and old.status = 'active' and new.status <> 'active' then
    new.order_status := 'cancelled';
  end if;
  return new;
end;
$$;
revoke all on function public.reservations_order_cancelled() from public, anon, authenticated;
drop trigger if exists reservations_order_cancelled on public.reservations;
create trigger reservations_order_cancelled
  before update of status on public.reservations
  for each row execute function public.reservations_order_cancelled();

-- ------------------------------------------------- PortPass's Market fees
-- The Seller plan and the commission on orders PortPass brought go on one
-- PortPass invoice per seller per month (brief 09's billing), of their own
-- kind so they never take the place of a business's plan or booking-fee
-- invoice for the same month. One a month: a second draft for the same
-- seller and month is refused by the index (create_portpass_invoice then
-- returns null and uses up no number).
alter table public.portpass_invoices drop constraint if exists portpass_invoices_kind_check;
alter table public.portpass_invoices add constraint portpass_invoices_kind_check
  check (kind in ('subscription', 'commission', 'manual', 'historical', 'market'));
drop index if exists public.portpass_invoices_period_idx;
create unique index if not exists portpass_invoices_period_idx
  on public.portpass_invoices (organization_id, kind, period_start)
  where kind in ('subscription', 'commission', 'market') and status <> 'void';
