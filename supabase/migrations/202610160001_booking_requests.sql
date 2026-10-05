-- Booking requests for any offering (brief 19, part A, 5 Oct 2026). A
-- priced service with no link of its own (a photo booth, a party rental, a
-- training pack, a DJ) can be asked for on PortPass: the customer picks a
-- date and leaves their details, the business confirms or declines, and a
-- confirmed booking can be followed by a payment request (brief 17).
--
-- Nothing here takes money and nothing is sent on a schedule: the customer
-- gets one email when the request is received, and one when a person at
-- the business presses Confirm or Decline.
--
-- Server-only like the rest of the schema: RLS on, no grants to
-- anon/authenticated. The business's team reads its own requests through
-- the service role after lib/auth/guards.ts has said who they are; the
-- customer's page reads one request by its unguessable public_token.
--
-- Futprep's private-session requests (private_session_requests) stay as
-- they are and are not moved here.

-- Booking codes read CP-B0007, beside requests (CP-0042) and receipts
-- (CP-R0007): the same per-business prefix and its own counter.
alter table public.organization_payment_settings
  add column if not exists next_booking_number integer not null default 1 check (next_booking_number > 0);

create table if not exists public.booking_requests (
  id                  bigint generated always as identity primary key,
  organization_id     bigint not null references public.organizations(id) on delete cascade,
  -- The offering can be removed later; what was asked for stays readable.
  offering_id         bigint references public.offerings(id) on delete set null,
  offering_name       text not null check (length(btrim(offering_name)) between 1 and 160),
  reference_number    integer not null check (reference_number > 0),
  reference_code      text not null check (reference_code ~ '^[A-Z]{2,4}-B[0-9]{4,}$'),
  -- The customer's page: /booking/<public_token>. 40 hex characters, random.
  public_token        text not null unique check (public_token ~ '^[a-f0-9]{40}$'),

  -- The customer: the adult who asked. Both an email (the confirmation
  -- goes there) and a phone (how the business reaches them).
  person_id           bigint references public.people(id) on delete set null,
  customer_name       text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_email      text not null check (length(customer_email) <= 254 and position('@' in customer_email) > 1),
  customer_phone      text not null check (customer_phone ~ '^\+[1-9][0-9]{6,14}$'),
  -- An offering for under-18s: the adult says they are the parent or
  -- guardian, and gives the child's first name only. No health details.
  guardian_confirmed  boolean not null default false,
  child_first_name    text check (child_first_name is null or length(btrim(child_first_name)) between 1 and 60),

  requested_date      date not null,
  requested_time      text check (requested_time is null or requested_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- "3 hours", "12 people", "2": the customer's own words.
  duration_or_qty     text not null default '' check (length(duration_or_qty) <= 60),
  location_text       text not null default '' check (length(location_text) <= 200),
  notes               text not null default '' check (length(notes) <= 1000),

  status              text not null default 'new' check (status in ('new', 'confirmed', 'done', 'declined', 'cancelled')),
  declined_reason     text check (declined_reason is null or length(declined_reason) <= 300),
  -- The offering's price and unit on the day it was asked for.
  price_cents         integer check (price_cents is null or (price_cents >= 0 and price_cents <= 10000000)),
  price_unit          text,
  -- The newest payment request made from this booking, if any.
  payment_request_id  bigint references public.payment_requests(id) on delete set null,

  -- Where the customer came from (lib/attribution.ts): the channel the
  -- server worked out, and the tags it rests on.
  source              text not null default 'unknown',
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  referrer_host       text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  done_at             timestamptz,
  declined_at         timestamptz,
  cancelled_at        timestamptz,
  -- Who at the business last changed the status (a name, for the list).
  handled_by_name     text,

  unique (organization_id, reference_number),
  unique (organization_id, reference_code),
  constraint booking_requests_decline_needs_reason check (status <> 'declined' or length(btrim(coalesce(declined_reason, ''))) > 0)
);
create index if not exists booking_requests_org_idx on public.booking_requests (organization_id, created_at desc);
create index if not exists booking_requests_new_idx on public.booking_requests (organization_id) where status = 'new';
create index if not exists booking_requests_email_idx on public.booking_requests (lower(customer_email));
create index if not exists booking_requests_payment_request_idx on public.booking_requests (payment_request_id) where payment_request_id is not null;
alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from anon, authenticated;

-- Create a request with the business's next booking number. The settings
-- row is locked by the update, so two customers asking at once get B0007
-- and B0008, never the same code. p carries the validated request: the
-- server has checked the offering belongs to the business and can be booked.
create or replace function public.booking_request_create(p jsonb)
returns public.booking_requests
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org bigint := (p->>'organization_id')::bigint;
  v_number integer;
  v_prefix text;
  v_row public.booking_requests;
begin
  insert into public.organization_payment_settings (organization_id, reference_prefix)
  values (v_org, p->>'default_prefix')
  on conflict (organization_id) do nothing;

  update public.organization_payment_settings
  set next_booking_number = next_booking_number + 1
  where organization_id = v_org
  returning next_booking_number - 1, reference_prefix into v_number, v_prefix;

  insert into public.booking_requests (
    organization_id, offering_id, offering_name, reference_number, reference_code, public_token,
    person_id, customer_name, customer_email, customer_phone, guardian_confirmed, child_first_name,
    requested_date, requested_time, duration_or_qty, location_text, notes,
    price_cents, price_unit, source, utm_source, utm_medium, utm_campaign, referrer_host
  ) values (
    v_org,
    nullif(p->>'offering_id', '')::bigint,
    p->>'offering_name',
    v_number,
    v_prefix || '-B' || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end,
    p->>'public_token',
    nullif(p->>'person_id', '')::bigint,
    p->>'customer_name',
    p->>'customer_email',
    p->>'customer_phone',
    coalesce((p->>'guardian_confirmed')::boolean, false),
    nullif(p->>'child_first_name', ''),
    (p->>'requested_date')::date,
    nullif(p->>'requested_time', ''),
    coalesce(p->>'duration_or_qty', ''),
    coalesce(p->>'location_text', ''),
    coalesce(p->>'notes', ''),
    nullif(p->>'price_cents', '')::integer,
    nullif(p->>'price_unit', ''),
    coalesce(nullif(p->>'source', ''), 'unknown'),
    nullif(p->>'utm_source', ''),
    nullif(p->>'utm_medium', ''),
    nullif(p->>'utm_campaign', ''),
    nullif(p->>'referrer_host', '')
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Only the server (service role) calls this; Postgres grants EXECUTE to
-- PUBLIC by default.
revoke all on function public.booking_request_create(jsonb) from public, anon, authenticated;
grant execute on function public.booking_request_create(jsonb) to service_role;
