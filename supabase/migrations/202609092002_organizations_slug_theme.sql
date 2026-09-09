-- BUILD_PLAN stage 1.2: organizations.slug and organizations.theme so the
-- platform layer can stop branching on organization name/id. registration_url
-- is the immediate, minimal thing needed to retire the isFutprep check in the
-- org dashboard (stage 1.1) - a real per-org public registration page comes
-- later in stage 6, this just records where the current one lives.
alter table public.organizations
  add column if not exists slug text,
  add column if not exists theme jsonb not null default '{}'::jsonb,
  add column if not exists registration_url text;

update public.organizations
  set slug = 'futprep', registration_url = '/futprep/lil-kickers/register'
  where name ilike '%futprep%' or name ilike '%footprep%';

create unique index if not exists organizations_slug_key on public.organizations (slug) where slug is not null;
