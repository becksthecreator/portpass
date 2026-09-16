-- Lead-capture table for the Bahamas Weddings By The Sea guided planner
-- (app/weddings/bahamas-by-the-sea). Single-tenant on purpose: this is a
-- separate family business, not a PortPass organization, so it doesn't
-- reference organizations/programs the way Futprep does. Phase 1 per the
-- growth plan is asset-light (capture + notify); a real inbox/dashboard is
-- Phase 2 once the Wedding Desk operating model is approved.
create table if not exists public.wedding_inquiries (
  id bigint generated always as identity primary key,
  partner_one_name text not null,
  partner_two_name text,
  contact_email text not null,
  contact_phone text,
  wedding_date_preference text,
  guest_count_estimate integer,
  ceremony_style text,
  venue_preference text,
  services_wanted text[] not null default '{}',
  consultation_preference text,
  preferred_contact_time text,
  notes text,
  status text not null default 'new' check (status in ('new','contacted','consultation_scheduled','plan_sent','booked','closed')),
  created_at timestamptz not null default now()
);

alter table public.wedding_inquiries enable row level security;
