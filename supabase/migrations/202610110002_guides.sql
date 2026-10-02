-- Guides (brief 11, 3): pages at /guides/[slug], written by Antonio, that
-- link to live listings. Not machine-written: the five below start as
-- drafts with an outline only, and a guide can't be published while any
-- "[Antonio: ...]" note is left in it.
create table if not exists public.guides (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  title text not null check (length(btrim(title)) between 8 and 90),
  description text not null default '' check (length(description) <= 170),
  -- Plain text with a few marks: "## " headings, "- " lists, blank lines
  -- between paragraphs, [words](/a-portpass-page or https://...) links.
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.guides enable row level security;
revoke all on public.guides from anon, authenticated;

comment on table public.guides is
  'Guides at /guides/[slug], written by the founders. Draft until published; linked businesses in guide_listings.';

-- The businesses a guide links to, in order, each with a line on why.
create table if not exists public.guide_listings (
  id bigint generated always as identity primary key,
  guide_id bigint not null references public.guides(id) on delete cascade,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  note text check (note is null or length(note) <= 200),
  sort_order integer not null default 0,
  unique (guide_id, organization_id)
);

create index if not exists guide_listings_org_idx on public.guide_listings (organization_id);

alter table public.guide_listings enable row level security;
revoke all on public.guide_listings from anon, authenticated;

-- The five guides the brief asks for, as drafts with an outline for
-- Antonio to write. None is public until he publishes it.
insert into public.guides (slug, title, description, body) values
  ('things-to-do-in-nassau-with-kids', 'Things to do in Nassau with kids', 'Things to do with children in Nassau: sports classes, camps, parties and days out you can book.',
   E'[Antonio: a few lines on what this guide covers and who it is for.]\n\n## Saturday sports\n\n[Antonio: what is on, ages, what it costs.]\n\n## Holiday camps\n\n[Antonio: the camps, dates, how to book.]\n\n## Birthday parties\n\n[Antonio: rentals, photo booths, where to hold one.]\n\n## Days out\n\n[Antonio: your own picks.]'),
  ('kids-football-and-sports-nassau', 'Kids'' football and sports programmes in Nassau', 'Kids'' football and sports programmes in Nassau: ages, times, prices and how to register.',
   E'[Antonio: a few lines on choosing a programme.]\n\n## Football\n\n[Antonio: programmes, ages, Saturdays, fees.]\n\n## Other sports\n\n[Antonio: what else there is.]\n\n## What to bring\n\n[Antonio: kit, water, sun.]'),
  ('birthday-party-nassau', 'Planning a birthday party in Nassau: rentals, photo booths, DJs', 'Planning a birthday party in Nassau: party rentals, photo booths, DJs and venues you can book.',
   E'[Antonio: a few lines on planning a party here.]\n\n## Rentals\n\n[Antonio: tents, tables, bounce houses.]\n\n## Photo booths\n\n[Antonio: what to look for.]\n\n## Music\n\n[Antonio: DJs and sound.]\n\n## A timeline\n\n[Antonio: what to book when.]'),
  ('getting-married-in-the-bahamas', 'Getting married in The Bahamas: officiants, venues, planners', 'Getting married in The Bahamas: the licence, officiants, venues and planners, from someone who does it.',
   E'[Antonio: a few lines from you as an officiant.]\n\n## The marriage licence\n\n[Antonio: what couples need, how long it takes.]\n\n## Choosing a venue\n\n[Antonio: beach, resort, villa.]\n\n## Officiants and planners\n\n[Antonio: what to ask.]'),
  ('nassau-for-cruise-visitors', 'Nassau for cruise visitors: what you can book in 8 hours', 'Nassau for cruise passengers: what you can book and get back to the ship for, in one day in port.',
   E'[Antonio: a few lines on a day in port.]\n\n## Near the port\n\n[Antonio: what is walkable.]\n\n## Half-day trips\n\n[Antonio: tours and boats.]\n\n## Getting back on time\n\n[Antonio: your advice.]')
on conflict (slug) do nothing;
