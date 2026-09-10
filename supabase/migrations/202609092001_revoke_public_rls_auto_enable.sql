-- rls_auto_enable() is SECURITY DEFINER. It was left executable by anon and
-- authenticated (and, implicitly, by PUBLIC), which made it callable
-- unauthenticated at /rest/v1/rpc/rls_auto_enable. Nothing in this codebase
-- calls it - the app only ever talks to Supabase through the service-role
-- client in db/supabase.ts - so revoking public execute access removes a
-- live, unused attack surface with no functional impact.
--
-- The function itself is a Supabase-platform artifact on the hosted
-- project, not something any migration here creates, so it doesn't exist
-- on a plain local Postgres instance (e.g. `supabase start` for
-- integration tests). Guard the revoke on its existence so this migration
-- replays cleanly everywhere; identical effect on the hosted project.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;
