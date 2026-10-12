-- A sixth database check for Admin -> Health and the CI test
-- (db/adminHealth.integration.test.ts), from the security review of
-- brief 25 (PR #196, 11 Oct 2026): a view in public that a browser role
-- can read and that does not run with the caller's rights. Such a view
-- reads the tables under it as its owner, so their row level security is
-- skipped for whoever selects from it. Every view PortPass has is
-- security_invoker; this keeps it so. A materialized view can't be
-- security_invoker at all, so one a browser role can read counts too.
-- Must stay at zero, like the other five.
create or replace function public.admin_database_checks()
returns table (check_name text, problems bigint)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select 'tables_without_rls'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all
  select 'tables_with_rls_but_no_policy'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  union all
  select 'tables_browser_roles_can_write'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE')
          or has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE'))
  union all
  select 'functions_without_search_path'::text, count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'definer_functions_open_to_browser_roles'::text, count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all
  -- A grant on one column is enough to read through the view, so any
  -- column counts. security_invoker is read as Postgres reads it: "on",
  -- "true" and the rest all mean on.
  select 'definer_views_open_to_browser_roles'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and (has_any_column_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('authenticated', c.oid, 'SELECT'))
     and not coalesce((select o.option_value::boolean from pg_options_to_table(c.reloptions) o where o.option_name = 'security_invoker'), false);
$$;

revoke all on function public.admin_database_checks() from public, anon, authenticated;
