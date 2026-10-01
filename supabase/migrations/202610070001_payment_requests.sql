-- Payment requests and reconciliation for every business (brief 17,
-- Payments Phase 1, 1 Oct 2026). A business sends a request, the customer
-- pays however they already pay (bank transfer, cash, a Kanoo wallet
-- transfer they make themselves), the business marks it paid, and PortPass
-- shows what's collected, what's outstanding and who to chase.
--
-- Money never enters PortPass's possession: no escrow, no balances, no
-- wallets, no fees deducted, and no card payments. Recorded payments are
-- what the business tells us it received.
--
-- Server-only like the rest of the schema: RLS on, no grants to
-- anon/authenticated. Every read and write goes through the service role in
-- db/paymentRequests.ts after lib/paymentRequests/access.ts has said who
-- may handle that business's payments (its owner, its admins, staff with
-- the payments permission below, PortPass platform owners, and for Futprep
-- its admin and CEO staff logins). The customer's page reads one request
-- by its unguessable public_token, never by id.

-- ---------------------------------------------------- the payments permission
-- Owners and admins always handle payments; a staff member only once an
-- owner ticks this for them (Payments -> Settings).
alter table public.organization_members
  add column if not exists can_manage_payments boolean not null default false;

-- ------------------------------------------------- organization_payment_settings
-- How a business's customers pay it, shown on every request's page. Never a
-- full bank account number in a column: only the last four digits. A
-- business that wants its full number on the customer page writes it into
-- transfer_instructions, which is shown only on a request's own page.
create table if not exists public.organization_payment_settings (
  organization_id        bigint primary key references public.organizations(id) on delete cascade,
  -- Request codes read FP-0042, receipts FP-R0007: the business's own two to
  -- four letters (not unique across businesses; codes are unique per business).
  reference_prefix       text not null check (reference_prefix ~ '^[A-Z]{2,4}$'),
  next_request_number    integer not null default 1 check (next_request_number > 0),
  next_receipt_number    integer not null default 1 check (next_receipt_number > 0),
  bank_name              text not null default '' check (length(bank_name) <= 120),
  account_name           text not null default '' check (length(account_name) <= 120),
  account_number_last4   text check (account_number_last4 ~ '^[0-9]{4}$'),
  transfer_instructions  text not null default '' check (length(transfer_instructions) <= 1000),
  -- Shown as text only ("send to ..."): PortPass never links into a wallet.
  kanoo_handle_or_phone  text not null default '' check (length(kanoo_handle_or_phone) <= 80),
  -- Where and when cash is taken.
  cash_note              text not null default '' check (length(cash_note) <= 300),
  default_due_days       integer not null default 7 check (default_due_days between 0 and 90),
  updated_at             timestamptz not null default now(),
  updated_by             text
);
alter table public.organization_payment_settings enable row level security;
revoke all on public.organization_payment_settings from anon, authenticated;

-- Futprep's codes already read FP-, and its confirmed bank details are the
-- ones its registration form already shows every parent
-- (app/futprep/config.ts, FUTPREP_BANK_DETAILS): the last four digits in
-- their own column, the full number only in the instructions. Its staff
-- can change them in Payments -> Settings.
insert into public.organization_payment_settings (organization_id, reference_prefix, bank_name, account_name, account_number_last4, transfer_instructions)
select id, 'FP', 'First Caribbean International Bank (Bahamas) Limited', 'Futprep Athletics', '4879',
       'Account number 07046-2017344879 (SWIFT FCIBBSNS). Put your reference in the transfer note so Futprep can match it.'
from public.organizations where slug = 'futprep'
on conflict (organization_id) do nothing;

-- ------------------------------------------------------------ line items
-- Each line: {"label": text, "qty": 1..999, "unit_cents": 0..}. Returns the
-- total, or null when any line is malformed, so the check below refuses
-- both a bad line and a total that doesn't add up.
create or replace function public.payment_lines_total(lines jsonb)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  -- No casts until every line has passed: a CASE checks its branches in
  -- order, an OR may not.
  select case
    when jsonb_typeof(lines) is distinct from 'array' then null
    when jsonb_array_length(lines) not between 1 and 20 then null
    when exists (
      select 1 from jsonb_array_elements(lines) e
      where jsonb_typeof(e) is distinct from 'object'
         or jsonb_typeof(e->'label') is distinct from 'string'
         or jsonb_typeof(e->'qty') is distinct from 'number'
         or jsonb_typeof(e->'unit_cents') is distinct from 'number'
         or length(btrim(e->>'label')) not between 1 and 160
         or (e->>'qty') !~ '^[1-9][0-9]{0,2}$'
         or (e->>'unit_cents') !~ '^(0|[1-9][0-9]{0,7})$'
    ) then null
    else (select sum((e->>'qty')::bigint * (e->>'unit_cents')::bigint)::bigint from jsonb_array_elements(lines) e)
  end
$$;

-- -------------------------------------------------------- payment_requests
create table if not exists public.payment_requests (
  id                         bigint generated always as identity primary key,
  organization_id            bigint not null references public.organizations(id) on delete cascade,
  reference_number           integer not null check (reference_number > 0),
  reference_code             text not null check (reference_code ~ '^[A-Z]{2,4}-[0-9]{4,}$'),
  -- The customer's page: /pay/<public_token>. 40 hex characters, random.
  public_token               text not null unique check (public_token ~ '^[a-f0-9]{40}$'),

  -- The customer.
  person_id                  bigint references public.people(id) on delete set null,
  customer_name              text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_email             text check (customer_email is null or (length(customer_email) <= 254 and position('@' in customer_email) > 1)),
  customer_phone             text check (customer_phone is null or customer_phone ~ '^\+[1-9][0-9]{6,14}$'),

  -- What it's for, when it came from an existing record (at most one).
  registration_id            bigint references public.registrations(id) on delete set null,
  private_session_request_id bigint references public.private_session_requests(id) on delete set null,
  reservation_id             bigint references public.reservations(id) on delete set null,
  offering_id                bigint references public.offerings(id) on delete set null,

  line_items                 jsonb not null,
  total_cents                integer not null check (total_cents > 0 and total_cents <= 10000000),
  currency                   text not null default 'BSD' check (currency = 'BSD'),
  due_date                   date not null,
  allow_part_payment         boolean not null default false,
  -- Phase 2 of PortPass_Payments_Build_Plan.md adds 'card' and 'kanoo_link'
  -- here, with a processor. Until then only the three manual methods exist.
  methods_allowed            text[] not null check (cardinality(methods_allowed) between 1 and 3 and methods_allowed <@ array['cash', 'bank_transfer', 'kanoo_wallet_manual']::text[]),

  -- Derived by payment_requests_derive_status() from paid_cents, total and
  -- sent_at; staff only ever set void. Overdue is derived, never stored.
  status                     text not null default 'draft' check (status in ('draft', 'sent', 'part_paid', 'paid', 'void')),
  -- Sum of the received payments against this request, kept by a trigger
  -- on payments.
  paid_cents                 integer not null default 0 check (paid_cents >= 0),
  paid_at                    timestamptz,

  -- Always a person pressing a button: WhatsApp (wa.me link the staff
  -- member sends), email on click, handed over in person, or the link copied.
  sent_via                   text check (sent_via in ('whatsapp_link', 'email', 'in_person', 'link')),
  sent_at                    timestamptz,
  last_reminded_at           timestamptz,
  last_reminded_via          text check (last_reminded_via in ('whatsapp_link', 'email')),
  reminder_count             integer not null default 0 check (reminder_count >= 0),

  -- The customer tapped "I've paid": a flag for staff to check and confirm.
  -- It never changes the status.
  customer_says_paid_at      timestamptz,
  customer_says_paid_note    text check (length(customer_says_paid_note) <= 300),

  -- Reserved for Phase 2 (a processor attached to a request). Unused.
  provider                   text,
  provider_ref               text,

  created_by                 uuid references auth.users(id) on delete set null,
  created_by_name            text not null default '',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  voided_at                  timestamptz,
  voided_reason              text,

  unique (organization_id, reference_number),
  unique (organization_id, reference_code),
  constraint payment_requests_customer_contact check (customer_email is not null or customer_phone is not null),
  constraint payment_requests_one_link check (num_nonnulls(registration_id, private_session_request_id, reservation_id) <= 1),
  constraint payment_requests_lines_add_up check (payment_lines_total(line_items) is not distinct from total_cents),
  -- A request with money recorded against it can't be voided: record a
  -- refund on the payment instead.
  constraint payment_requests_void_needs_reason check (status <> 'void' or (length(btrim(coalesce(voided_reason, ''))) > 0 and paid_cents = 0)),
  constraint payment_requests_sent_has_via check ((sent_at is null) = (sent_via is null))
);
create index if not exists payment_requests_org_idx on public.payment_requests (organization_id, created_at desc);
create index if not exists payment_requests_open_idx on public.payment_requests (organization_id, due_date) where status in ('sent', 'part_paid');
create index if not exists payment_requests_registration_idx on public.payment_requests (registration_id) where registration_id is not null;
create index if not exists payment_requests_private_session_idx on public.payment_requests (private_session_request_id) where private_session_request_id is not null;
create index if not exists payment_requests_reservation_idx on public.payment_requests (reservation_id) where reservation_id is not null;
alter table public.payment_requests enable row level security;
revoke all on public.payment_requests from anon, authenticated;

-- The status follows the money: paid in full -> paid, something -> part
-- paid, nothing yet -> sent (once sent) or draft. Void stays void.
create or replace function public.payment_requests_derive_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'void' then
    new.status := case
      when new.paid_cents >= new.total_cents then 'paid'
      when new.paid_cents > 0 then 'part_paid'
      when new.sent_at is not null then 'sent'
      else 'draft'
    end;
  end if;
  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;
  if new.status = 'void' then
    new.voided_at := coalesce(new.voided_at, now());
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists payment_requests_derive_status on public.payment_requests;
create trigger payment_requests_derive_status
before insert or update on public.payment_requests
for each row execute function public.payment_requests_derive_status();

-- ---------------------------------------------------------------- payments
-- A payment can belong to a request, to the existing links (a registration,
-- a private session, an event ticket), or to a request made from one of
-- those (both set). Several payments can make up one request.
alter table public.payments add column if not exists payment_request_id bigint references public.payment_requests(id) on delete cascade;
alter table public.payments add column if not exists receipt_number text;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists refund_note text check (length(refund_note) <= 300);
create index if not exists payments_payment_request_idx on public.payments (payment_request_id) where payment_request_id is not null;

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('cash', 'bank_transfer', 'online_banking', 'kanoo_wallet_manual'));

-- One owner check instead of two. The live database also carries an
-- event_ticket_id column (and a check pairing it with registration_id
-- that refused every private-session payment); a database built from
-- these migrations doesn't, so the check is written for whichever exists.
alter table public.payments drop constraint if exists payments_one_owner_check;
alter table public.payments drop constraint if exists payments_single_target_chk;
alter table public.payments drop constraint if exists payments_owner_check;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'event_ticket_id'
  ) then
    alter table public.payments add constraint payments_owner_check check (
      num_nonnulls(registration_id, private_session_request_id, event_ticket_id) <= 1
      and num_nonnulls(registration_id, private_session_request_id, event_ticket_id, payment_request_id) >= 1
    );
  else
    alter table public.payments add constraint payments_owner_check check (
      num_nonnulls(registration_id, private_session_request_id) <= 1
      and num_nonnulls(registration_id, private_session_request_id, payment_request_id) >= 1
    );
  end if;
end;
$$;

-- Keeps payment_requests.paid_cents equal to the received payments against
-- it, whichever screen recorded, refunded or deleted one (the Futprep desk
-- deletes a voided payment).
create or replace function public.payments_refresh_request()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ids bigint[];
begin
  ids := array_remove(array[
    case when tg_op <> 'INSERT' then old.payment_request_id end,
    case when tg_op <> 'DELETE' then new.payment_request_id end
  ], null);
  if cardinality(ids) > 0 then
    update public.payment_requests r
    set paid_cents = coalesce((
      select sum(p.amount_cents) from public.payments p
      where p.payment_request_id = r.id and p.status = 'received'
    ), 0)
    where r.id = any(ids);
  end if;
  return null;
end;
$$;

drop trigger if exists payments_refresh_request on public.payments;
create trigger payments_refresh_request
after insert or update or delete on public.payments
for each row execute function public.payments_refresh_request();

-- ------------------------------------------------------------- functions
-- Create a request with the business's next number. The settings row is
-- locked by the update, so two staff creating at once get FP-0042 and
-- FP-0043, never the same code. p carries the validated request; the
-- server computed total_cents and checked every link belongs to the business.
create or replace function public.payment_request_create(p jsonb)
returns public.payment_requests
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org bigint := (p->>'organization_id')::bigint;
  v_number integer;
  v_prefix text;
  v_row public.payment_requests;
begin
  insert into public.organization_payment_settings (organization_id, reference_prefix)
  values (v_org, p->>'default_prefix')
  on conflict (organization_id) do nothing;

  update public.organization_payment_settings
  set next_request_number = next_request_number + 1
  where organization_id = v_org
  returning next_request_number - 1, reference_prefix into v_number, v_prefix;

  insert into public.payment_requests (
    organization_id, reference_number, reference_code, public_token,
    person_id, customer_name, customer_email, customer_phone,
    registration_id, private_session_request_id, reservation_id, offering_id,
    line_items, total_cents, due_date, allow_part_payment, methods_allowed,
    created_by, created_by_name
  ) values (
    v_org,
    v_number,
    v_prefix || '-' || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end,
    p->>'public_token',
    nullif(p->>'person_id', '')::bigint,
    p->>'customer_name',
    nullif(p->>'customer_email', ''),
    nullif(p->>'customer_phone', ''),
    nullif(p->>'registration_id', '')::bigint,
    nullif(p->>'private_session_request_id', '')::bigint,
    nullif(p->>'reservation_id', '')::bigint,
    nullif(p->>'offering_id', '')::bigint,
    p->'line_items',
    (p->>'total_cents')::integer,
    (p->>'due_date')::date,
    coalesce((p->>'allow_part_payment')::boolean, false),
    array(select jsonb_array_elements_text(p->'methods_allowed')),
    nullif(p->>'created_by', '')::uuid,
    coalesce(p->>'created_by_name', '')
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Record money received against a request: never more than the balance,
-- part payments only when the request allows them, one receipt number each.
-- The request row is locked, so a double tap can't record it twice. The
-- payment carries the request's registration or private session too, so
-- the screens that read those (the Futprep desk, coach pay) still add up.
create or replace function public.payment_request_record_payment(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_req public.payment_requests;
  v_amount integer := (p->>'amount_cents')::integer;
  v_balance integer;
  v_number integer;
  v_prefix text;
  v_receipt text;
  v_payment_id bigint;
begin
  select * into v_req from public.payment_requests
  where id = (p->>'request_id')::bigint and organization_id = (p->>'organization_id')::bigint
  for update;
  if not found then
    raise exception 'PAYMENT_REQUEST_NOT_FOUND';
  end if;
  if v_req.status = 'void' then
    raise exception 'PAYMENT_REQUEST_VOID';
  end if;
  v_balance := v_req.total_cents - v_req.paid_cents;
  if v_balance <= 0 then
    raise exception 'PAYMENT_REQUEST_ALREADY_PAID';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > v_balance then
    raise exception 'PAYMENT_REQUEST_BAD_AMOUNT';
  end if;
  if v_amount < v_balance and not v_req.allow_part_payment then
    raise exception 'PAYMENT_REQUEST_PART_NOT_ALLOWED';
  end if;

  update public.organization_payment_settings
  set next_receipt_number = next_receipt_number + 1
  where organization_id = v_req.organization_id
  returning next_receipt_number - 1, reference_prefix into v_number, v_prefix;
  v_receipt := v_prefix || '-R' || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end;

  insert into public.payments (
    payment_request_id, registration_id, private_session_request_id,
    amount_cents, method, status, recorded_by, note, reference, received_at, receipt_number
  ) values (
    v_req.id, v_req.registration_id, v_req.private_session_request_id,
    v_amount, p->>'method', 'received', p->>'recorded_by', coalesce(p->>'note', ''),
    nullif(p->>'reference', ''), (p->>'received_at')::timestamptz, v_receipt
  )
  returning id into v_payment_id;

  return jsonb_build_object('payment_id', v_payment_id, 'receipt_number', v_receipt);
end;
$$;

-- Only the server (service role) calls these; Postgres grants EXECUTE to
-- PUBLIC by default.
revoke all on function public.payment_request_create(jsonb) from public, anon, authenticated;
revoke all on function public.payment_request_record_payment(jsonb) from public, anon, authenticated;
revoke all on function public.payment_lines_total(jsonb) from public, anon, authenticated;
grant execute on function public.payment_request_create(jsonb) to service_role;
grant execute on function public.payment_request_record_payment(jsonb) to service_role;
grant execute on function public.payment_lines_total(jsonb) to service_role;
