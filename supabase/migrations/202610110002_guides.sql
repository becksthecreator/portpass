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
-- Antonio to write: the description and every section are notes for him,
-- so none can be published until he has written it.
insert into public.guides (slug, title, description, body) values
  ('things-to-do-in-nassau-with-kids', 'Things to do in Nassau with kids', '[Antonio: one line for search results, about 150 characters.]',
   E'[Antonio: a few lines on what this guide covers and who it is for.]\n\n## Saturday sports\n\n[Antonio: what is on, ages, what it costs.]\n\n## Holiday camps\n\n[Antonio: the camps, dates, how to book.]\n\n## Birthday parties\n\n[Antonio: rentals, photo booths, where to hold one.]\n\n## Days out\n\n[Antonio: your own picks.]'),
  ('kids-football-and-sports-nassau', 'Kids'' football and sports programmes in Nassau', '[Antonio: one line for search results, about 150 characters.]',
   E'[Antonio: a few lines on choosing a programme.]\n\n## Football\n\n[Antonio: programmes, ages, Saturdays, fees.]\n\n## Other sports\n\n[Antonio: what else there is.]\n\n## What to bring\n\n[Antonio: kit, water, sun.]'),
  ('birthday-party-nassau', 'Planning a birthday party in Nassau: rentals, photo booths, DJs', '[Antonio: one line for search results, about 150 characters.]',
   E'[Antonio: a few lines on planning a party here.]\n\n## Rentals\n\n[Antonio: tents, tables, bounce houses.]\n\n## Photo booths\n\n[Antonio: what to look for.]\n\n## Music\n\n[Antonio: DJs and sound.]\n\n## A timeline\n\n[Antonio: what to book when.]'),
  ('getting-married-in-the-bahamas', 'Getting married in The Bahamas: officiants, venues, planners', '[Antonio: one line for search results, about 150 characters.]',
   E'[Antonio: a few lines from you as an officiant.]\n\n## The marriage licence\n\n[Antonio: what couples need, how long it takes.]\n\n## Choosing a venue\n\n[Antonio: beach, resort, villa.]\n\n## Officiants and planners\n\n[Antonio: what to ask.]'),
  ('nassau-for-cruise-visitors', 'Nassau for cruise visitors: what you can book in 8 hours', '[Antonio: one line for search results, about 150 characters.]',
   E'[Antonio: a few lines on a day in port.]\n\n## Near the port\n\n[Antonio: what is walkable.]\n\n## Half-day trips\n\n[Antonio: tours and boats.]\n\n## Getting back on time\n\n[Antonio: your advice.]')
on conflict (slug) do nothing;

-- A guide can be public only when it is written (no "[Antonio: ...]" note
-- left, a description of 50+ characters, a body of 400+) and links at
-- least one business that is live today. lib/guides.ts gives the same
-- rules in words; this is the check that can't be raced.
create or replace function public.guide_is_publishable(p_id bigint)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select g.body !~ '\[Antonio:[^]]*\]'
       and g.description !~ '\[Antonio:[^]]*\]'
       and length(btrim(g.description)) >= 50
       and length(btrim(g.body)) >= 400
       and exists (
         select 1 from public.guide_listings gl
         join public.organizations o on o.id = gl.organization_id
         where gl.guide_id = g.id and o.is_published and o.status <> 'suspended' and o.slug is not null
       )
    from public.guides g where g.id = p_id
  ), false);
$$;

revoke all on function public.guide_is_publishable(bigint) from public, anon, authenticated;

-- Saves a guide and the businesses it links to in one go, with its audit
-- row: all of it or none of it. A published guide keeps its address (links
-- to it keep working) and must still be fit to publish after the save.
create or replace function public.save_guide(p_id bigint, p_slug text, p_title text, p_description text, p_body text, p_listings jsonb, p_actor uuid)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id bigint := p_id;
  v_before public.guides;
  v_before_listings integer := 0;
begin
  if p_id is not null then
    select * into v_before from public.guides where id = p_id for update;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_before.published_at is not null and p_slug <> v_before.slug then
      raise exception 'SLUG_FROZEN';
    end if;
    select count(*) into v_before_listings from public.guide_listings where guide_id = p_id;
    update public.guides
       set slug = p_slug, title = p_title, description = p_description, body = p_body, updated_at = now(), updated_by = p_actor
     where id = p_id;
  else
    insert into public.guides (slug, title, description, body, updated_by)
    values (p_slug, p_title, p_description, p_body, p_actor)
    returning id into v_id;
  end if;

  delete from public.guide_listings where guide_id = v_id;
  insert into public.guide_listings (guide_id, organization_id, note, sort_order)
  select v_id, (item->>'organizationId')::bigint, nullif(btrim(coalesce(item->>'note', '')), ''), (ord - 1)::integer
    from jsonb_array_elements(coalesce(p_listings, '[]'::jsonb)) with ordinality as listing(item, ord);

  if v_before.status = 'published' and not public.guide_is_publishable(v_id) then
    raise exception 'NOT_PUBLISHABLE';
  end if;

  insert into public.audit_log (actor_user_id, action, target_table, target_id, before, after)
  values (
    p_actor,
    case when p_id is null then 'guide.created' else 'guide.updated' end,
    'guides',
    v_id::text,
    case when p_id is null then null else jsonb_build_object('slug', v_before.slug, 'title', v_before.title, 'listings', v_before_listings) end,
    jsonb_build_object('slug', p_slug, 'title', p_title, 'listings', jsonb_array_length(coalesce(p_listings, '[]'::jsonb)))
  );
  return v_id;
end;
$$;

revoke all on function public.save_guide(bigint, text, text, text, text, jsonb, uuid) from public, anon, authenticated;

-- Publish or unpublish, checked under the same lock a save takes.
create or replace function public.set_guide_status(p_id bigint, p_status text, p_actor uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_guide public.guides;
begin
  if p_status not in ('draft', 'published') then
    raise exception 'BAD_STATUS';
  end if;
  select * into v_guide from public.guides where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_status = 'published' and not public.guide_is_publishable(p_id) then
    raise exception 'NOT_PUBLISHABLE';
  end if;
  update public.guides
     set status = p_status,
         published_at = case when p_status = 'published' then coalesce(v_guide.published_at, now()) else v_guide.published_at end,
         updated_by = p_actor
   where id = p_id;
  insert into public.audit_log (actor_user_id, action, target_table, target_id, before, after)
  values (p_actor, case when p_status = 'published' then 'guide.published' else 'guide.unpublished' end, 'guides', p_id::text,
          jsonb_build_object('status', v_guide.status), jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.set_guide_status(bigint, text, uuid) from public, anon, authenticated;
