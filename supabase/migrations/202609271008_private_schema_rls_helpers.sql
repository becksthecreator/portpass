-- The RLS helper from accounts_core lived in public, which PostgREST
-- exposes as /rest/v1/rpc/current_user_org_ids -- harmless (it only ever
-- returns the caller's own memberships) but the security advisor flags any
-- signed-in-callable SECURITY DEFINER function (lint 0029). A schema that
-- isn't in the API's exposed list has no RPC endpoint, so the helper moves
-- there; the policy can still call it.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

drop policy if exists organization_members_select_same_org on public.organization_members;
drop function if exists public.current_user_org_ids();

create or replace function private.current_user_org_ids()
returns setof bigint
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select organization_id from public.organization_members where user_id = auth.uid()
$$;
revoke all on function private.current_user_org_ids() from public, anon;
grant execute on function private.current_user_org_ids() to authenticated;

create policy organization_members_select_same_org on public.organization_members
  for select to authenticated using (organization_id in (select private.current_user_org_ids()));
