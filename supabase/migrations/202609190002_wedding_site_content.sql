-- Bahamas Weddings By The Sea: site-wide trust stats (reviews/awards/years)
-- plus a real photo gallery, both editable later from /weddings/admin
-- without a developer. Singleton settings row (id fixed to 1) rather than
-- a key/value table, since the set of fields is small and known.
create table if not exists public.wedding_site_settings (
  id bigint primary key default 1 check (id = 1),
  review_count integer not null default 100,
  review_recommend_pct integer not null default 100,
  years_experience integer not null default 26,
  award_years jsonb not null default '[]'::jsonb,
  reviews_widget_html text,
  updated_at timestamptz not null default now()
);
alter table public.wedding_site_settings enable row level security;

insert into public.wedding_site_settings (id, review_count, review_recommend_pct, years_experience, award_years)
values (1, 100, 100, 26, '[2026,2023,2022,2021,2020,2019]'::jsonb)
on conflict (id) do nothing;

create table if not exists public.wedding_gallery_images (
  id bigint generated always as identity primary key,
  image_url text not null,
  caption text,
  photographer_name text,
  photographer_url text,
  is_hero boolean not null default false,
  visibility text not null default 'live' check (visibility in ('draft', 'live')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wedding_gallery_images enable row level security;

-- Seed with the three real, already-published photos so the gallery isn't
-- empty on day one. Antonio can add the rest of his 36 WeddingWire photos
-- (with photographer credit) once he confirms rights, via the admin.
insert into public.wedding_gallery_images (image_url, caption, is_hero, sort_order)
values
  ('/weddings/bahamas-by-the-sea/hero.jpg', 'A beachfront ceremony arch on Paradise Island.', true, 0),
  ('/weddings/bahamas-by-the-sea/ceremony.jpg', 'A real Bahamas Weddings By The Sea celebration on the beach.', false, 1),
  ('/weddings/bahamas-by-the-sea/antonio.jpg', 'Antonio Beckford, wedding planner and officiant.', false, 2);
