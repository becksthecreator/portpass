-- The system of record for wedding enquiries. public_token is the uuid a
-- future magic link uses so a sequential bigint id is never guessable from a
-- URL. idempotency_key prevents a double form-submit from creating two rows.
create table if not exists public.wedding_leads (
  id bigint generated always as identity primary key,
  public_token uuid not null default gen_random_uuid() unique,
  idempotency_key text not null unique,
  status text not null default 'new' check (status in (
    'new','pre_consultation','consultation_requested','planning',
    'ready_for_antonio','antonio_review','quoted','booked','closed')),
  names text not null,
  email text, phone text, travel_origin text,
  ceremony_type text,
  preferred_wedding_date date, arrival_date date,
  guest_count integer check (guest_count is null or guest_count >= 0),
  location_idea text,
  venue_id bigint references public.venues(id) on delete set null,
  venue_preference text,
  requested_services jsonb not null default '[]'::jsonb,
  consultation_method text check (consultation_method in ('phone','whatsapp_video','guided_text')),
  consultation_preferred_date date,
  consultation_preferred_time time,
  consultation_time_zone text,
  notes text,
  contact_consent boolean not null default false,
  marketing_consent boolean not null default false,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wedding_leads enable row level security;
-- No policies, deliberately. Access via server routes on the service role,
-- matching every other table in this database.
