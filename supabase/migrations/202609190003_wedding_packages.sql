-- Bahamas Weddings By The Sea: package tiers (levels of service, separate
-- from ceremony type -- a vow renewal or a full wedding can each be any
-- tier). Prices are Antonio's to set through the admin; this ships with
-- tiers present and prices null rather than a guessed number.
create table if not exists public.wedding_packages (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  tagline text,
  description text,
  includes jsonb not null default '[]'::jsonb,
  price_from_cents integer,
  price_note text,
  currency text not null default 'BSD',
  visibility text not null default 'draft'
    check (visibility in ('draft', 'unlisted', 'live')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wedding_packages enable row level security;

alter table public.wedding_leads
  add column if not exists package_id bigint references public.wedding_packages(id);

insert into public.wedding_packages (slug, name, tagline, description, includes, price_note, visibility, sort_order)
values
  (
    'ceremony',
    'Ceremony',
    'Antonio officiates. You arrange the rest.',
    'The ceremony itself, led personally by Antonio, while you handle the venue and every other detail yourselves.',
    '["Antonio as your licensed officiant", "Ceremony script consultation", "Guidance on the marriage licence process"]'::jsonb,
    'from',
    'live',
    0
  ),
  (
    'ceremony-coordination',
    'Ceremony + Coordination',
    'Antonio officiates; the Wedding Desk coordinates the rest.',
    'Antonio leads your ceremony while the Wedding Desk coordinates your venue and key suppliers so the day comes together without you managing it long-distance.',
    '["Everything in Ceremony", "Venue coordination", "Coordination with key suppliers (photo, film, flowers)", "A single point of contact before the day"]'::jsonb,
    'from',
    'live',
    1
  ),
  (
    'full-planning',
    'Full Planning',
    'Everything from first enquiry to the day itself.',
    'The complete plan: venue, flowers, photography, film, transport, and licence guidance, organized by the Wedding Desk and reviewed by Antonio.',
    '["Everything in Ceremony + Coordination", "Venue selection and booking", "Flowers, photography, and film arranged for you", "Transport planning", "Full licence guidance and paperwork support"]'::jsonb,
    'from',
    'live',
    2
  )
on conflict (slug) do nothing;
