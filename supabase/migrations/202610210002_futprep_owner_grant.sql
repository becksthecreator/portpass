-- Brief 31 (A4), 11 Oct 2026, after review: owner access to Futprep on
-- PortPass is given by a founder, never by a staff PIN session.
--
-- A staff login marked as the owner (staff_members.is_owner, 202610210001)
-- only asks. A platform owner, signed in with the admin second step,
-- grants the org_owner membership in Admin -> People, for the email the
-- founder saw and checked. The grant is recorded on the staff row
-- (owner_member_id, the membership's own id, and owner_user_id) so it can
-- be taken back: when the mark moves to another login, when the login is
-- switched off, or when its email changes (db/futprepOwner.ts). Only that
-- membership is ever taken back; one a founder removes or remakes in
-- People is not this grant any more.
--
-- Grant, take back and email changes are functions, so each runs in one
-- transaction with the staff row locked and every fact checked again
-- inside it. Server only: browser roles cannot call them.
--
-- Switch back:
--   drop function public.futprep_staff_set_email(bigint, bigint, text, text);
--   drop function public.futprep_owner_grant(bigint, bigint, text, uuid, uuid);
--   drop function public.futprep_owner_revoke(bigint, bigint, text, text, uuid);
--   alter table public.staff_members drop column owner_member_id, drop column owner_user_id;

alter table public.staff_members
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;
alter table public.staff_members
  add column if not exists owner_member_id bigint references public.organization_members (id) on delete set null;

comment on column public.staff_members.owner_user_id is
  'The PortPass sign-in a founder gave owner access to from this staff login (brief 31). Taken back when the owner mark moves, the login is switched off or its email changes.';
comment on column public.staff_members.owner_member_id is
  'The organization_members row that grant made (brief 31). Only this row is ever taken back.';

-- Takes back the membership this login's grant made, if it is still that
-- grant (same row, still org_owner). Returns whether a membership went.
create or replace function public.futprep_owner_revoke(p_org bigint, p_staff_id bigint, p_reason text, p_actor text, p_actor_user uuid default null)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_member bigint;
  v_deleted bigint;
  v_user uuid;
begin
  select owner_member_id into v_member
    from public.staff_members
   where id = p_staff_id and organization_id = p_org
     for update;
  if not found then
    return false;
  end if;
  update public.staff_members set owner_member_id = null, owner_user_id = null where id = p_staff_id;
  if v_member is null then
    return false;
  end if;
  delete from public.organization_members
   where id = v_member and organization_id = p_org and role = 'org_owner'
  returning id, user_id into v_deleted, v_user;
  if v_deleted is null then
    return false;
  end if;
  insert into public.audit_log (actor_user_id, organization_id, action, target_table, target_id, before, after)
  values (p_actor_user, p_org, 'membership.owner_revoked', 'organization_members', v_user::text,
          jsonb_build_object('role', 'org_owner', 'membership', v_deleted, 'from_staff_login', p_staff_id),
          jsonb_build_object('reason', p_reason, 'by', p_actor));
  return true;
end;
$$;

-- A founder's grant. Refused unless the login is still marked, active, a
-- CEO login, and has exactly the email the founder confirmed, and that
-- email is still the sign-in's. Someone already in the business is
-- refused: their role is changed in People. Returns 'granted' or 'already'.
create or replace function public.futprep_owner_grant(p_org bigint, p_staff_id bigint, p_email text, p_user uuid, p_founder uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_member bigint;
begin
  select id, role, email, active, account_key, is_owner, owner_member_id
    into v_row
    from public.staff_members
   where id = p_staff_id and organization_id = p_org
     for update;
  if not found or not v_row.active or v_row.account_key is null or not v_row.is_owner then
    raise exception 'NOT_MARKED' using errcode = 'P0001';
  end if;
  if v_row.role <> 'ceo' then
    raise exception 'NOT_A_CEO' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_email, ''))) = 0
     or lower(btrim(coalesce(v_row.email, ''))) <> lower(btrim(p_email))
     or not exists (select 1 from public.people where auth_user_id = p_user and lower(btrim(email::text)) = lower(btrim(p_email))) then
    raise exception 'EMAIL_CHANGED' using errcode = 'P0001';
  end if;
  if v_row.owner_member_id is not null then
    if exists (select 1 from public.organization_members where id = v_row.owner_member_id and user_id = p_user and role = 'org_owner') then
      return 'already';
    end if;
    perform public.futprep_owner_revoke(p_org, p_staff_id, 'email_changed', 'founder', p_founder);
  end if;
  if exists (select 1 from public.organization_members where organization_id = p_org and user_id = p_user) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;
  insert into public.organization_members (organization_id, user_id, role, can_view_medical, can_manage_payments, invited_by)
  values (p_org, p_user, 'org_owner', true, true, p_founder)
  returning id into v_member;
  update public.staff_members set owner_member_id = v_member, owner_user_id = p_user where id = p_staff_id;
  insert into public.audit_log (actor_user_id, organization_id, action, target_table, target_id, after)
  values (p_founder, p_org, 'membership.owner_granted', 'organization_members', p_user::text,
          jsonb_build_object('role', 'org_owner', 'can_manage_payments', true, 'membership', v_member, 'from_staff_login', p_staff_id));
  return 'granted';
end;
$$;

-- A staff login's email, changed with any owner grant on it taken back in
-- the same transaction, and an audit line that says it changed (never the
-- address). Returns whether it changed.
create or replace function public.futprep_staff_set_email(p_org bigint, p_staff_id bigint, p_email text, p_actor text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  select email into v_old
    from public.staff_members
   where id = p_staff_id and organization_id = p_org
     for update;
  if not found then
    raise exception 'ROW_NOT_FOUND' using errcode = 'P0001';
  end if;
  if lower(coalesce(v_old, '')) = lower(coalesce(p_email, '')) then
    return false;
  end if;
  update public.staff_members set email = p_email where id = p_staff_id;
  perform public.futprep_owner_revoke(p_org, p_staff_id, 'email_changed', p_actor, null);
  insert into public.audit_log (organization_id, action, target_table, target_id, before, after)
  values (p_org, 'staff.email_changed', 'staff_members', p_staff_id::text,
          jsonb_build_object('had_email', v_old is not null),
          jsonb_build_object('has_email', p_email is not null, 'by', p_actor));
  return true;
end;
$$;

-- Server only: PostgREST exposes public functions as /rpc/*, and Postgres
-- grants EXECUTE to PUBLIC by default.
revoke all on function public.futprep_owner_revoke(bigint, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.futprep_owner_grant(bigint, bigint, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.futprep_staff_set_email(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.futprep_owner_revoke(bigint, bigint, text, text, uuid) to service_role;
grant execute on function public.futprep_owner_grant(bigint, bigint, text, uuid, uuid) to service_role;
grant execute on function public.futprep_staff_set_email(bigint, bigint, text, text) to service_role;
