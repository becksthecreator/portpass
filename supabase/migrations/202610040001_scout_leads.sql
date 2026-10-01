-- PortPass Scout (brief 14, 30 Sept): the internal lead catalogue behind
-- Admin -> Leads. It replaces PortPass_Prospect_Tracker.xlsx (Handbook §8).
--
-- What may be stored here: a business's own published details (its name,
-- what it does, the phone, WhatsApp, email, website and Instagram it
-- publishes, its Google rating). Never personal data about individuals,
-- never anything from a private chat or group, never anything collected
-- by scraping. Sources are Google Places, Instagram Business Discovery for
-- a handle a founder typed, our own "get listed" form, referrals, and
-- what a founder types after a conversation.
--
-- "Do not contact" is permanent: the row stays as a tombstone (name and
-- matching keys only, contact details wiped) so the same business can
-- never be imported or added again.

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  business_name text not null,
  -- A section / subsection slug from the categories table, or null.
  section text,
  subsection text,
  island text,
  area text,
  what_they_do text,
  booking_method text not null default 'unknown'
    check (booking_method in ('whatsapp_dm', 'phone', 'instagram_dm', 'website_booking', 'unknown')),
  online_payment text,
  prices_text text,
  -- The business's own published contact details.
  instagram_handle text,
  phone text,
  whatsapp_e164 text,
  email text,
  website_url text,
  address text,
  google_place_id text,
  google_maps_url text,
  google_rating numeric(2, 1),
  google_rating_count integer,
  why_fit text,
  -- The tracker's 1-3 priority, kept for the import.
  priority smallint check (priority between 1 and 3),
  -- A founder's own knowledge: someone we already know (+10 on the score).
  warm_connection boolean not null default false,
  -- Handbook §8 lead score and the signals behind it.
  score integer check (score between 0 and 100),
  score_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'replied', 'page_drafted', 'live', 'not_now', 'do_not_contact')),
  source text not null
    check (source in ('google_places', 'instagram', 'inbound_form', 'referral', 'founder', 'tracker_import')),
  -- Where each fact came from, so a founder can check it.
  source_urls text[] not null default '{}',
  referral_code text,
  owner text,
  next_step text,
  last_contact_on date,
  notes text,
  -- The AI step (brief 14 §2): what it produced, when, and with what.
  draft_message text,
  enrichment jsonb,
  enriched_at timestamptz,
  enrichment_model text,
  organization_id bigint references public.organizations(id) on delete set null,
  application_id bigint references public.applications(id) on delete set null,
  -- Lower-cased, punctuation-free name: one row per business, so a second
  -- import or a "do not contact" business can't come back.
  dedupe_key text not null,
  -- Hashes of the business's phone numbers and its own website's host. They
  -- stay on a "do not contact" tombstone (which keeps no contact details)
  -- so the business can't come back under a slightly different name.
  match_keys text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_dedupe_key_idx on public.leads (dedupe_key);
create unique index if not exists leads_google_place_id_idx on public.leads (google_place_id) where google_place_id is not null;
create unique index if not exists leads_instagram_handle_idx on public.leads (lower(instagram_handle)) where instagram_handle is not null;
create index if not exists leads_match_keys_idx on public.leads using gin (match_keys);
create index if not exists leads_status_score_idx on public.leads (status, score desc nulls last);
create index if not exists leads_section_idx on public.leads (section);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

comment on table public.leads is
  'PortPass Scout: businesses that could be on PortPass (brief 14). Business-published details only; never personal data, never scraped. Platform staff only, through the server.';

-- Every outside lookup, for the daily cap (200 Google Places searches a
-- day) and the spend shown in admin.
create table if not exists public.scout_lookups (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('google_places', 'instagram', 'claude')),
  -- The search text or handle; never a person's details.
  query text not null,
  result_count integer not null default 0,
  -- An estimate from the provider's published price, in thousandths of a
  -- cent (so a $0.032 search is 3200).
  cost_millicents integer not null default 0,
  ok boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists scout_lookups_provider_created_idx on public.scout_lookups (provider, created_at desc);

alter table public.scout_lookups enable row level security;
revoke all on public.scout_lookups from anon, authenticated;

comment on table public.scout_lookups is
  'One row per outside lookup made by PortPass Scout (Google Places, Instagram Business Discovery, the AI step): the daily cap and the spend estimate come from here.';

-- "Businesses referred by live businesses": an optional code on the get
-- listed form, carried onto the lead it creates.
alter table public.applications
  add column if not exists referral_code text;
