-- The sign-up kit for events and walk-ins (brief 18, part C). A business
-- owner fills in a 30-second form at an event (/own, /join/<event>) and
-- becomes a Scout lead: status New, with the event it came from and the
-- consent they gave. Nothing is sent to them automatically; a founder
-- messages them by hand, as with every lead.

-- 1. Where the lead came from: a sign-up at an event.
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('google_places', 'instagram', 'inbound_form', 'referral', 'founder', 'tracker_import', 'event'));

-- 2. Which event ("own2026"), who signed up, and whether they said PortPass
--    may message them on WhatsApp about their page, and when.
alter table public.leads add column if not exists event_code text check (event_code is null or event_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(event_code) <= 40);
alter table public.leads add column if not exists contact_name text check (contact_name is null or length(contact_name) <= 120);
alter table public.leads add column if not exists whatsapp_consent boolean not null default false;
alter table public.leads add column if not exists whatsapp_consent_at timestamptz;

create index if not exists leads_event_code_idx on public.leads (event_code) where event_code is not null;

comment on column public.leads.event_code is 'The event a business signed up at (/own is own2026; /join/<event> for the next one).';
comment on column public.leads.whatsapp_consent is 'The person ticked "PortPass can message me on WhatsApp about my page". Recorded with its time; removed if the lead becomes do-not-contact.';
