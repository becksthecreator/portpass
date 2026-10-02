-- Member perks (brief 10): something a business offers people who have a
-- PortPass account. The business funds its own perk and applies it when it
-- takes payment. PortPass holds no customer money and changes no charge.
--
-- Access: row level security is on with no policy and the browser roles
-- have no rights, like every table here. The server decides who sees what:
-- a member sees their own redemptions; a business sees its own perks and
-- redemptions with the member's first name and member number only; platform
-- staff see everything.

-- 1. Every account gets a short member number, read out at a counter:
--    PP-7K3Q. No 0/O or 1/I/L. Unique and permanent.
alter table public.profiles add column if not exists member_number text;

create or replace function public.new_member_number()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  attempt integer := 0;
  digits integer := 4;
begin
  loop
    candidate := 'PP-';
    for i in 1..digits loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 31)::integer, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.member_number = candidate);
    attempt := attempt + 1;
    -- Four characters is about 900,000 numbers; grow rather than loop forever.
    if attempt % 20 = 0 and digits < 6 then
      digits := digits + 1;
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.new_member_number() from public, anon, authenticated;

create or replace function public.profiles_set_member_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.member_number is null then
    new.member_number := public.new_member_number();
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_set_member_number() from public, anon, authenticated;

drop trigger if exists profiles_member_number on public.profiles;
create trigger profiles_member_number
  before insert on public.profiles
  for each row execute function public.profiles_set_member_number();

-- The accounts that exist already.
do $$
declare
  r record;
begin
  for r in select user_id from public.profiles where member_number is null loop
    update public.profiles set member_number = public.new_member_number() where user_id = r.user_id;
  end loop;
end;
$$;

alter table public.profiles alter column member_number set not null;
create unique index if not exists profiles_member_number_idx on public.profiles (member_number);
alter table public.profiles drop constraint if exists profiles_member_number_format;
alter table public.profiles add constraint profiles_member_number_format check (member_number ~ '^PP-[2-9A-HJKMNP-Z]{4,6}$');

-- 1b. A name that was never typed. An account made before sign-up asked
--     for a name was given the first half of its email address as one.
--     That is never shown to a business, or on the pass: "Member" is,
--     until the person gives their name. Nobody's stored name is changed.
alter table public.profiles add column if not exists name_from_email boolean not null default false;
update public.profiles p
   set name_from_email = true
  from auth.users u
 where u.id = p.user_id
   and u.email is not null
   and lower(btrim(p.full_name)) = lower(split_part(u.email, '@', 1));

-- 2. The perks.
create table if not exists public.member_perks (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  -- null: the perk is for everything the business offers.
  offering_id bigint references public.offerings(id) on delete set null,
  title text not null check (length(btrim(title)) between 4 and 80),
  kind text not null check (kind in ('percent_off', 'amount_off', 'free_addon', 'early_access', 'priority')),
  percent integer check (percent between 1 and 100),
  amount_cents integer check (amount_cents > 0),
  addon_text text,
  early_access_hours integer check (early_access_hours between 1 and 720),
  first_booking_only boolean not null default false,
  min_spend_cents integer check (min_spend_cents > 0),
  starts_on date,
  ends_on date,
  monthly_cap integer check (monthly_cap > 0),
  conditions_text text,
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  published_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Each kind carries its own number or words.
  constraint member_perks_kind_has_value check (
    (kind = 'percent_off' and percent is not null)
    or (kind = 'amount_off' and amount_cents is not null)
    or (kind = 'free_addon' and length(btrim(coalesce(addon_text, ''))) > 0)
    or (kind = 'early_access' and early_access_hours is not null)
    or kind = 'priority'
  ),
  constraint member_perks_dates_in_order check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index if not exists member_perks_org_idx on public.member_perks (organization_id, status);
create index if not exists member_perks_offering_idx on public.member_perks (offering_id) where offering_id is not null;
create index if not exists member_perks_live_idx on public.member_perks (published_at desc) where status = 'live';

alter table public.member_perks enable row level security;
revoke all on public.member_perks from anon, authenticated;

comment on table public.member_perks is
  'What a business offers PortPass members. The business funds and applies it; PortPass never changes a charge.';

-- 3. Each time a perk is used.
create table if not exists public.perk_redemptions (
  id bigint generated always as identity primary key,
  perk_id bigint not null references public.member_perks(id) on delete cascade,
  -- The member. If the account is closed the line stays, with no person on it.
  profile_id uuid references public.profiles(user_id) on delete set null,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  -- What it was used on: a registration's reference, a booking id, or blank at the counter.
  booking_ref text,
  method text not null check (method in ('online', 'pass_scan')),
  -- null for a perk that isn't money (a free extra, early access, priority).
  discount_cents integer check (discount_cents >= 0),
  -- Copied from the perk when it is used, so "first booking only" is kept
  -- by the database: one use per member, even if two tills press at once.
  first_booking boolean not null default false,
  recorded_by text,
  redeemed_at timestamptz not null default now()
);

create unique index if not exists perk_redemptions_first_booking_idx on public.perk_redemptions (perk_id, profile_id) where first_booking and profile_id is not null;
create index if not exists perk_redemptions_org_idx on public.perk_redemptions (organization_id, redeemed_at desc);
create index if not exists perk_redemptions_profile_idx on public.perk_redemptions (profile_id, redeemed_at desc);
create index if not exists perk_redemptions_perk_idx on public.perk_redemptions (perk_id, redeemed_at desc);

alter table public.perk_redemptions enable row level security;
revoke all on public.perk_redemptions from anon, authenticated;

-- 3b. An offering a perk was for is removed: the perk ends with it,
--     rather than becoming a perk on everything the business sells (a
--     published perk never changes). Logged.
create or replace function public.end_perks_for_removed_offering()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  -- The whole business is being deleted: its perks go with it, and there is
  -- no business left to log against.
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;
  for r in
    update public.member_perks
       set status = 'ended', ended_at = now(), ended_reason = 'The offering it was for was removed', updated_at = now()
     where offering_id = old.id and status <> 'ended'
    returning id, organization_id, title
  loop
    insert into public.audit_log (actor_user_id, organization_id, action, target_table, target_id, before, after)
    values (null, r.organization_id, 'perk.ended', 'member_perks', r.id::text, jsonb_build_object('title', r.title), jsonb_build_object('status', 'ended', 'reason', 'The offering it was for was removed'));
  end loop;
  return old;
end;
$$;

revoke all on function public.end_perks_for_removed_offering() from public, anon, authenticated;

drop trigger if exists offerings_end_member_perks on public.offerings;
create trigger offerings_end_member_perks
  before delete on public.offerings
  for each row execute function public.end_perks_for_removed_offering();

-- 3c. Recording a perk used: the month's limit is counted and the use
--     written in one step, under a lock per perk, so two tills can't both
--     take the last one. "First booking only" is held by the unique index.
create or replace function public.record_perk_redemption(
  p_perk_id bigint,
  p_profile_id uuid,
  p_organization_id bigint,
  p_booking_ref text,
  p_method text,
  p_discount_cents integer,
  p_first_booking boolean,
  p_recorded_by text,
  p_month_start timestamptz,
  p_monthly_cap integer
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('perk_redemptions'), p_perk_id::integer);
  if p_monthly_cap is not null and (select count(*) from public.perk_redemptions where perk_id = p_perk_id and redeemed_at >= p_month_start) >= p_monthly_cap then
    raise exception 'MONTH_FULL';
  end if;
  insert into public.perk_redemptions (perk_id, profile_id, organization_id, booking_ref, method, discount_cents, first_booking, recorded_by)
  values (p_perk_id, p_profile_id, p_organization_id, p_booking_ref, p_method, p_discount_cents, p_first_booking, p_recorded_by)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_perk_redemption(bigint, uuid, bigint, text, text, integer, boolean, text, timestamptz, integer) from public, anon, authenticated;

comment on table public.perk_redemptions is
  'One row each time a member used a perk: which perk, which member, how, and the discount when it was money.';

-- 4. Launch bonus (Marketplace only): until this date PortPass takes no
--    commission on bookings made by members.
alter table public.organizations add column if not exists member_commission_free_until date;

-- 5. Where a new account came from (utm_source on the sign-up link: "perk",
--    "own", a counter QR). One of a short list of tags, never an identifier:
--    any other value is kept as "other".
alter table public.profiles add column if not exists signup_source text;
alter table public.profiles drop constraint if exists profiles_signup_source_format;
alter table public.profiles add constraint profiles_signup_source_format check (signup_source is null or signup_source in ('perk', 'own', 'counter_qr', 'instagram', 'pass', 'other'));

-- 6. Every Member Pass check a business makes, so guessing codes can be
--    stopped whichever server answers. No member is named on a failed check.
create table if not exists public.member_pass_checks (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  checked_by uuid references auth.users(id) on delete set null,
  ok boolean not null,
  checked_at timestamptz not null default now()
);

create index if not exists member_pass_checks_org_idx on public.member_pass_checks (organization_id, checked_at desc);

alter table public.member_pass_checks enable row level security;
revoke all on public.member_pass_checks from anon, authenticated;

create index if not exists member_pass_checks_by_idx on public.member_pass_checks (checked_by, checked_at desc);

comment on table public.member_pass_checks is
  'One row per Member Pass check by a business: when, and whether it was valid. Used to limit guessing; kept 30 days.';

-- 7. Claiming a check before it is made: counted and written in one step,
--    under a lock per business, so checks sent all at once can't slip past
--    the limit. A check starts as not valid and is marked valid afterwards.
--    Returns the check's id, or null when the business (8 wrong in 10
--    minutes) or the person checking (20 wrong in 10 minutes, across every
--    business they work for) has to wait.
create or replace function public.claim_member_pass_check(p_organization_id bigint, p_checked_by uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('member_pass_checks'), p_organization_id::integer);
  perform pg_advisory_xact_lock(hashtext('member_pass_checks_by'), hashtext(p_checked_by::text));
  if (select count(*) from public.member_pass_checks where organization_id = p_organization_id and not ok and checked_at > now() - interval '10 minutes') >= 8 then
    return null;
  end if;
  if (select count(*) from public.member_pass_checks where checked_by = p_checked_by and not ok and checked_at > now() - interval '10 minutes') >= 20 then
    return null;
  end if;
  insert into public.member_pass_checks (organization_id, checked_by, ok) values (p_organization_id, p_checked_by, false) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.claim_member_pass_check(bigint, uuid) from public, anon, authenticated;
