-- Admin Control Center, build C (brief 08): the Messages log (1.10) and
-- the health tiles on the Overview (1.1).

-- 1. Messages log: what the email service said happened next. The service
--    gives each email an id when it accepts it; its webhook later reports
--    "delivered", "bounced" or "complained" against that id.
alter table public.message_log add column if not exists provider_id text;
create index if not exists message_log_provider_idx on public.message_log (provider_id) where provider_id is not null;
create index if not exists message_log_status_idx on public.message_log (status, created_at desc);

alter table public.message_log drop constraint if exists message_log_status_check;
alter table public.message_log add constraint message_log_status_check
  check (status in ('sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped'));

-- 2. Site errors: one row each time a page or route fails on the server.
--    Deliberately thin: the route's pattern (never the address, which can
--    hold a reference code or a token), the kind of error and the digest
--    to look up in the host's logs. No message, no personal data.
create table if not exists public.site_errors (
  id bigint generated always as identity primary key,
  route text not null,
  route_type text not null default '',
  error_name text not null default '',
  digest text,
  created_at timestamptz not null default now()
);

create index if not exists site_errors_created_idx on public.site_errors (created_at desc);

alter table public.site_errors enable row level security;
revoke all on public.site_errors from anon, authenticated;

comment on table public.site_errors is
  'Server-side failures for the Admin health tiles: route pattern, error kind, digest. No message text and no personal data.';

-- 3. Database checks, for the health tile. The same three things Supabase's
--    security advisor warns about first: a table with row level security
--    off, a function whose search_path is not fixed, and a "security
--    definer" function that a browser role may call. Server only.
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
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
$$;

revoke all on function public.admin_database_checks() from public, anon, authenticated;
