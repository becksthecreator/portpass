-- Class feed (Nov 2026): a coach or admin posts an update to one class in
-- one term ("Bring water, we start at 9:15 this Saturday"), and the parents
-- of the children in that class read it on /futprep/feed and get it by
-- email. It replaces the per-class WhatsApp groups.
--
-- Text only. No child is named in a post's columns, and no health,
-- allergy, medication or emergency detail is ever stored here (rule 3):
-- the staff screen says so above the box.
--
-- Removing a post hides it (deleted_at) rather than deleting the row, so
-- "who said what to which parents, and when" stays answerable.

create table if not exists public.class_posts (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  program_id bigint not null references public.programs(id) on delete cascade,
  term_id bigint not null references public.program_terms(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_account text not null,
  author_name text not null default '',
  emailed_count integer not null default 0 check (emailed_count >= 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);

create index if not exists class_posts_class_idx
  on public.class_posts (program_id, term_id, created_at desc)
  where deleted_at is null;

-- The server reads and writes it with the service role; nobody else.
alter table public.class_posts enable row level security;
revoke all on public.class_posts from anon, authenticated;
drop policy if exists class_posts_browser_roles_denied on public.class_posts;
create policy class_posts_browser_roles_denied on public.class_posts as restrictive for all to anon, authenticated using (false) with check (false);
