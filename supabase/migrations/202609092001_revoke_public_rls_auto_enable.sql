-- rls_auto_enable() is SECURITY DEFINER. It was left executable by anon and
-- authenticated (and, implicitly, by PUBLIC), which made it callable
-- unauthenticated at /rest/v1/rpc/rls_auto_enable. Nothing in this codebase
-- calls it - the app only ever talks to Supabase through the service-role
-- client in db/supabase.ts - so revoking public execute access removes a
-- live, unused attack surface with no functional impact.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
