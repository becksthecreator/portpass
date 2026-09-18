-- Captures interest in a category that doesn't have real listings yet
-- (venues, events, entertainment). The first real data PortPass has for
-- those categories -- staff read it directly, no public surface.
create table if not exists public.interest_submissions (
  id bigint generated always as identity primary key,
  category text not null check (category in ('venues','events','entertainment')),
  name text,
  email text,
  phone text,
  note text,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.interest_submissions enable row level security;
-- No policies, deliberately. Access via server routes on the service role,
-- matching every other table in this database.
