-- Accounts, block 1 of the 25 Sept accounts brief: who a signed-in human
-- is (profiles), who belongs to which business and as what
-- (organization_members / organization_invites), what changed and who did
-- it (audit_log), and the people/guardianship layer that links customers
-- to the bookings they already made before accounts existed.
--
-- Identity is auth.users (uuid). Everything else stays bigint; this file
-- is the one place the uuid/bigint boundary is allowed.
--
-- Additive only. Every existing table stays service-role-only exactly as
-- today; the only browser-readable rows introduced here are a user's own
-- profile and the membership rows of organizations they belong to.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null,
  phone_e164     text,
  platform_role  text check (platform_role in ('platform_owner','platform_admin')),
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------ organization_members
create table if not exists public.organization_members (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  user_id          uuid   not null references auth.users(id) on delete cascade,
  role             text   not null check (role in ('org_owner','org_admin','org_staff','org_viewer')),
  can_view_medical boolean not null default false,
  invited_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists organization_members_user_idx on public.organization_members (user_id);
create index if not exists organization_members_org_idx on public.organization_members (organization_id);

-- A policy on organization_members that reads organization_members would
-- recurse; a security-definer helper breaks the loop. Only authenticated
-- callers may run it, and it only ever answers "which orgs am I in".
create or replace function public.current_user_org_ids()
returns setof bigint
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select organization_id from public.organization_members where user_id = auth.uid()
$$;
revoke all on function public.current_user_org_ids() from public, anon;
grant execute on function public.current_user_org_ids() to authenticated;

alter table public.organization_members enable row level security;
revoke all on public.organization_members from anon, authenticated;
grant select on public.organization_members to authenticated;
drop policy if exists organization_members_select_same_org on public.organization_members;
create policy organization_members_select_same_org on public.organization_members
  for select to authenticated using (organization_id in (select public.current_user_org_ids()));

-- ------------------------------------------------------ organization_invites
create table if not exists public.organization_invites (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  email            extensions.citext not null,
  role             text   not null check (role in ('org_owner','org_admin','org_staff','org_viewer')),
  can_view_medical boolean not null default false,
  token_hash       text   not null unique,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  invited_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists organization_invites_email_idx on public.organization_invites (email);
create index if not exists organization_invites_open_idx on public.organization_invites (expires_at) where accepted_at is null;
alter table public.organization_invites enable row level security;
revoke all on public.organization_invites from anon, authenticated;

-- --------------------------------------------------------------- audit_log
create table if not exists public.audit_log (
  id               bigint generated always as identity primary key,
  actor_user_id    uuid references auth.users(id),
  organization_id  bigint references public.organizations(id),
  action           text not null,
  target_table     text,
  target_id        text,
  before           jsonb,
  after            jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_user_id);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

-- ---------------------------------------------------- people / guardianships
create table if not exists public.people (
  id             bigint generated always as identity primary key,
  auth_user_id   uuid references auth.users(id) on delete set null,
  name           text not null,
  email          extensions.citext,
  phone_e164     text,
  created_at     timestamptz not null default now()
);
create unique index if not exists people_email_unique on public.people (email) where email is not null;
create unique index if not exists people_auth_user_unique on public.people (auth_user_id) where auth_user_id is not null;
alter table public.people enable row level security;
revoke all on public.people from anon, authenticated;

create table if not exists public.guardianships (
  guardian_person_id bigint not null references public.people(id) on delete cascade,
  child_person_id    bigint not null references public.people(id) on delete cascade,
  relationship       text,
  created_at         timestamptz not null default now(),
  primary key (guardian_person_id, child_person_id)
);
alter table public.guardianships enable row level security;
revoke all on public.guardianships from anon, authenticated;

alter table public.registrations
  add column if not exists child_person_id  bigint references public.people(id) on delete set null,
  add column if not exists parent_person_id bigint references public.people(id) on delete set null;
create index if not exists registrations_child_person_idx on public.registrations (child_person_id);
create index if not exists registrations_parent_person_idx on public.registrations (parent_person_id);

alter table public.wedding_leads
  add column if not exists person_id bigint references public.people(id) on delete set null;
create index if not exists wedding_leads_person_idx on public.wedding_leads (person_id);

-- Backfill: one person per registered child. No guardians are created
-- here -- on 27 Sept every one of the 18 registrations had a NULL parent
-- name/email/phone (all were staff-entered), so there is nothing to link
-- yet. Parents get linked when their contact details arrive. Idempotent:
-- only registrations without a child_person_id are touched.
do $$
declare
  r record;
  pid bigint;
begin
  for r in
    select id, child_name from public.registrations
    where child_person_id is null and child_name is not null and length(trim(child_name)) > 0
    order by id
  loop
    insert into public.people (name) values (trim(r.child_name)) returning id into pid;
    update public.registrations set child_person_id = pid where id = r.id;
  end loop;
end $$;
