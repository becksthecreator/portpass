-- Admin -> Our tools (speed & sign-in brief, 29 Sept, part 3): the founders'
-- working links, editable in admin and visible to platform owners only.
-- Seeded with the five Claude artifacts from Beckford_HQ_Links.md by
-- title; the URLs are pasted in from admin (the file was not in the repo
-- or the queue zip when this was written).
create table if not exists public.admin_links (
  id          bigint generated always as identity primary key,
  title       text not null,
  url         text,
  description text,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.admin_links enable row level security;
revoke all on public.admin_links from anon, authenticated;

insert into public.admin_links (title, description, sort)
select v.title, v.description, v.sort
from (values
  ('The Handbook',      'How PortPass works, section by section (v1.3: "Brought by PortPass" is §5).', 1),
  ('Pricing & Quotes',  'Plans, add-ons and the quote sheet that /pricing follows.',                 2),
  ('The Brand Board',   'Harbour Signal palette, Archivo type and the Prow logo files.',             3),
  ('The Master Calendar','Terms, camps, shoots and conference dates in one place.',                   4),
  ('The shoot plans',   'Photo and video plans for Futprep, BWS and Carv.',                            5)
) as v(title, description, sort)
where not exists (select 1 from public.admin_links);
