-- Quick fixes, 29 Sept (item 1). The Admin Overview counts registrations
-- by created_at, which registrations never had (it has submitted_at); the
-- HEAD count against a missing column returned an empty error and the
-- whole Overview threw 500 right after two-step login. Antonio applied
-- this live on 29 Sept as "registrations_created_at_for_admin_overview";
-- this file keeps the repo's migration history in step with the database
-- and is a no-op where the column already exists.
alter table public.registrations
  add column if not exists created_at timestamptz not null default now();

update public.registrations
   set created_at = submitted_at
 where created_at > submitted_at;
