-- PortPass Points, a ledger only (brief 25, part D, 6 Oct 2026). No
-- redemption, no shop credit, no sponsor flow: that is Phase 2, after the
-- attorney reads the scheme. Points have no cash value, cannot be
-- transferred, and expire 12 months after they are earned.
--
-- Who earns: an adult PortPass account holder, never a child. Children do
-- not have PortPass accounts; a child's registration is held by its
-- guardian's account (registrations.parent_person_id -> people.auth_user_id),
-- so a child's attendance earns to that guardian. An event records why
-- (reason) and what for (ref_type + ref_id: 'registration' and the
-- registration's id, 'reservation' and the order's id) and the business,
-- nothing else: no child's name, age or any other identifier, ever. A
-- business's own team never earns on their own business.
--
-- How: database triggers, so every way attendance is marked (the business
-- register, Futprep's staff screens and three-tap register) and every way
-- an order becomes paid (the seller's Paid button, its payment request)
-- earns the same. Each change settles that one thing to what it should
-- have earned: attended (or paid) and nothing standing, it earns; no longer
-- attended (the mark undone) or no longer paid (refunded, voided), what it
-- earned comes back off. A points problem never stops the attendance mark
-- or the payment: the trigger logs a warning and lets the write through.
--
-- Reads: an account holder may read only their own account and events
-- (RLS, granted to signed-in accounts); the account page reads them on the
-- server. Writes: only these functions; no browser role can write or call
-- them.

-- ---------------------------------------------------------------- the rules
alter table public.market_settings
  add column if not exists points_per_dollar     integer not null default 1 check (points_per_dollar between 0 and 1000),
  add column if not exists points_per_attendance integer not null default 10 check (points_per_attendance between 0 and 10000);

-- ------------------------------------------------------------- the ledger
create table if not exists public.points_accounts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  balance    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.points_events (
  id              bigint generated always as identity primary key,
  account_id      bigint not null references public.points_accounts(id) on delete cascade,
  delta           integer not null check (delta <> 0),
  reason          text not null check (reason in ('order_paid', 'booking_attended', 'programme_milestone', 'manual_adjust', 'expiry')),
  ref_type        text check (ref_type in ('registration', 'reservation', 'points_event')),
  ref_id          bigint,
  -- The business it was earned with, for the account page's wording.
  organization_id bigint references public.organizations(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- An earning's lapse date; expired_at marks an event settled: an earning
  -- that has expired or been taken back, and the event that took it back.
  -- Settled events count in the balance and never again in a settlement.
  expires_at      timestamptz,
  expired_at      timestamptz,
  constraint points_events_ref_pair check ((ref_type is null) = (ref_id is null)),
  constraint points_events_expiry_on_earnings check (expires_at is null or delta > 0)
);
-- An earning expires once.
create unique index if not exists points_events_expires_once on public.points_events (account_id, ref_id) where ref_type = 'points_event';
create index if not exists points_events_account_idx on public.points_events (account_id, created_at desc);
create index if not exists points_events_ref_idx on public.points_events (account_id, ref_type, ref_id) where expired_at is null;
create index if not exists points_events_expiring_idx on public.points_events (expires_at) where expires_at is not null and expired_at is null;

-- -------------------------------------------------------------- settling
-- Brings one thing's points (an order, a registration) to what it should
-- be. Earned and nothing standing: it earns p_amount, lapsing in 12 months.
-- Not earned and something standing: that comes back off, and both the
-- earning and the reversal are settled. The account row is locked first,
-- so two changes at once can never both earn, and expiry (which takes the
-- same lock first) can never take an earning off a second time.
create or replace function public.points_settle(p_user_id uuid, p_ref_type text, p_ref_id bigint, p_earned boolean, p_amount integer, p_reason text, p_organization_id bigint)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_account bigint;
  v_standing integer;
begin
  if p_user_id is null or p_ref_id is null then
    return;
  end if;
  insert into public.points_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select id into v_account from public.points_accounts where user_id = p_user_id for update;
  select coalesce(sum(delta), 0) into v_standing
    from public.points_events
   where account_id = v_account and ref_type = p_ref_type and ref_id = p_ref_id and expired_at is null;
  if p_earned and v_standing = 0 and coalesce(p_amount, 0) > 0 then
    insert into public.points_events (account_id, delta, reason, ref_type, ref_id, organization_id, expires_at)
    values (v_account, p_amount, p_reason, p_ref_type, p_ref_id, p_organization_id, now() + interval '12 months');
    update public.points_accounts set balance = balance + p_amount, updated_at = now() where id = v_account;
  elsif not p_earned and v_standing > 0 then
    update public.points_events set expired_at = now()
     where account_id = v_account and ref_type = p_ref_type and ref_id = p_ref_id and expired_at is null;
    insert into public.points_events (account_id, delta, reason, ref_type, ref_id, organization_id, expired_at)
    values (v_account, -v_standing, 'manual_adjust', p_ref_type, p_ref_id, p_organization_id, now());
    update public.points_accounts set balance = balance - v_standing, updated_at = now() where id = v_account;
  end if;
end;
$$;

-- Attendance marked, changed or undone: the registration's account holder
-- has points_per_attendance while the registration has any present or late
-- mark (once per registration, however many sessions), and not otherwise.
-- Never for the demo business, never for the business's own team, never
-- without an account to earn to.
create or replace function public.points_on_attendance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_registration bigint := case when tg_op = 'DELETE' then old.registration_id else new.registration_id end;
  v_user uuid;
  v_org bigint;
  v_points integer;
begin
  begin
    select pe.auth_user_id, r.organization_id into v_user, v_org
      from public.registrations r
      join public.people pe on pe.id = r.parent_person_id
      join public.organizations o on o.id = r.organization_id and not o.is_demo
     where r.id = v_registration;
    if v_user is null or exists (select 1 from public.organization_members m where m.organization_id = v_org and m.user_id = v_user) then
      return null;
    end if;
    select points_per_attendance into v_points from public.market_settings where id;
    perform public.points_settle(
      v_user, 'registration', v_registration,
      exists (select 1 from public.attendance a where a.registration_id = v_registration and a.status in ('present', 'late')),
      coalesce(v_points, 0), 'booking_attended', v_org
    );
  exception when others then
    raise warning 'points_on_attendance: % (registration %)', sqlstate, v_registration;
  end;
  return null;
end;
$$;

drop trigger if exists points_on_attendance on public.attendance;
create trigger points_on_attendance
  after insert or update of status or delete on public.attendance
  for each row execute function public.points_on_attendance();

-- A Market order's payment status changed: the buyer's PortPass account (by
-- the email they ordered with, matched as the sign-in matches it) has
-- points_per_dollar for each whole dollar while the order is paid, and not
-- otherwise (refunded, voided). Paid again later, it earns again. Never for
-- the demo, the business's own team, or a drop reservation.
create or replace function public.points_on_order_paid()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid;
  v_points integer;
begin
  if new.kind <> 'order' or new.payment_status is not distinct from old.payment_status then
    return null;
  end if;
  begin
    if exists (select 1 from public.organizations o where o.id = new.organization_id and o.is_demo) or new.buyer_email is null then
      return null;
    end if;
    select pe.auth_user_id into v_user from public.people pe where pe.email = new.buyer_email::extensions.citext and pe.auth_user_id is not null;
    if v_user is null or exists (select 1 from public.organization_members m where m.organization_id = new.organization_id and m.user_id = v_user) then
      return null;
    end if;
    select points_per_dollar into v_points from public.market_settings where id;
    perform public.points_settle(v_user, 'reservation', new.id, new.payment_status = 'paid', (new.total_cents / 100) * coalesce(v_points, 0), 'order_paid', new.organization_id);
  exception when others then
    raise warning 'points_on_order_paid: % (order %)', sqlstate, new.id;
  end;
  return null;
end;
$$;

drop trigger if exists points_on_order_paid on public.reservations;
create trigger points_on_order_paid
  after update of payment_status on public.reservations
  for each row execute function public.points_on_order_paid();

-- The daily job: earnings older than 12 months come off, once each. The
-- account row is locked before the earning, in the same order a settlement
-- takes them, and the earning is re-checked under the lock. Returns how
-- many earnings expired.
create or replace function public.points_expire()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_delta integer;
  v_org bigint;
  v_count integer := 0;
begin
  for v_row in
    select e.id, e.account_id
      from public.points_events e
     where e.expires_at is not null and e.expires_at <= now() and e.expired_at is null
     order by e.id
  loop
    perform 1 from public.points_accounts where id = v_row.account_id for update;
    select delta, organization_id into v_delta, v_org from public.points_events where id = v_row.id and expired_at is null for update;
    if not found then
      continue;
    end if;
    update public.points_events set expired_at = now() where id = v_row.id;
    insert into public.points_events (account_id, delta, reason, ref_type, ref_id, organization_id, expired_at)
    values (v_row.account_id, -v_delta, 'expiry', 'points_event', v_row.id, v_org, now());
    update public.points_accounts set balance = balance - v_delta, updated_at = now() where id = v_row.account_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ------------------------------------------------------------ who may read
-- A fourth kind of table beside public, owner-only and platform-only (Brief
-- 21, part B): own rows. A signed-in account reads its own and nothing
-- else; no browser role writes.
alter table public.points_accounts enable row level security;
alter table public.points_events enable row level security;
revoke all on public.points_accounts from anon, authenticated;
revoke all on public.points_events from anon, authenticated;
grant select on public.points_accounts to authenticated;
grant select on public.points_events to authenticated;

drop policy if exists points_accounts_own on public.points_accounts;
create policy points_accounts_own on public.points_accounts
  for select to authenticated using (user_id = auth.uid());
drop policy if exists points_events_own on public.points_events;
create policy points_events_own on public.points_events
  for select to authenticated using (account_id in (select id from public.points_accounts where user_id = auth.uid()));

revoke all on function public.points_settle(uuid, text, bigint, boolean, integer, text, bigint) from public, anon, authenticated;
revoke all on function public.points_on_attendance() from public, anon, authenticated;
revoke all on function public.points_on_order_paid() from public, anon, authenticated;
revoke all on function public.points_expire() from public, anon, authenticated;
grant execute on function public.points_settle(uuid, text, bigint, boolean, integer, text, bigint) to service_role;
grant execute on function public.points_expire() to service_role;
