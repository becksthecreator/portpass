-- PortPass billing (brief 09, parts 2 and 3): what businesses owe PortPass,
-- and when. Deliberately separate from `payments`, which is customers'
-- money paid to businesses. Money is integer cents. Nothing here charges
-- anyone: PortPass invoices, and the business pays by transfer.
--
-- Access: like every table in this project, row level security is on with
-- no policy, and the browser roles have no rights. Every read and write
-- goes through the server, which checks the platform role (Admin ->
-- Billing) or that the person is an owner or admin of that business (the
-- "Your plan" card). Nothing is written from a browser.

-- 1. One account per business.
create table if not exists public.billing_accounts (
  id bigint generated always as identity primary key,
  organization_id bigint not null unique references public.organizations(id) on delete cascade,
  plan_code text,
  cycle text not null default 'not_agreed' check (cycle in ('monthly', 'annual', 'commission_monthly', 'per_event', 'not_agreed')),
  -- The monthly price agreed at signing. Changing the price list never
  -- changes this.
  price_cents integer not null default 0 check (price_cents >= 0),
  annual_months_charged integer not null default 10 check (annual_months_charged between 1 and 12),
  retainer_cents integer not null default 0 check (retainer_cents >= 0),
  extra_locations integer not null default 0 check (extra_locations >= 0),
  extra_location_cents integer not null default 2500 check (extra_location_cents >= 0),
  commission_bps integer not null default 0 check (commission_bps between 0 and 10000),
  go_live_on date,
  free_months_credit integer not null default 0 check (free_months_credit between 0 and 36),
  credit_reason text,
  free_until_override date,
  free_until_override_reason text,
  -- Worked out on every save and by the daily job (lib/billing.ts).
  free_until date,
  first_invoice_on date,
  next_invoice_on date,
  status text not null default 'not_live' check (status in ('not_live', 'trial', 'active', 'past_due', 'paused', 'ended')),
  setup_fee_cents integer not null default 0 check (setup_fee_cents >= 0),
  setup_status text not null default 'waived' check (setup_status in ('due', 'paid', 'waived')),
  agreement_signed_on date,
  agreement_version text,
  billing_email text check (billing_email is null or (length(billing_email) <= 254 and position('@' in billing_email) > 1)),
  billing_whatsapp_e164 text check (billing_whatsapp_e164 is null or billing_whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- Pausing or ending an account is a founders' decision, with a reason.
  paused boolean not null default false,
  ended boolean not null default false,
  status_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_accounts_credit_has_reason check (free_months_credit = 0 or length(btrim(coalesce(credit_reason, ''))) > 0),
  constraint billing_accounts_override_has_reason check (free_until_override is null or length(btrim(coalesce(free_until_override_reason, ''))) > 0)
);

alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from anon, authenticated;

comment on table public.billing_accounts is
  'What each business has agreed to pay PortPass: plan, cycle, price at signing, free period, and where the account stands.';

-- 2. Invoice numbers: PP-YYYY-NNN, one counter a year, never reused.
create table if not exists public.portpass_invoice_counters (
  year integer primary key check (year between 2020 and 2200),
  last integer not null default 0 check (last >= 0)
);

alter table public.portpass_invoice_counters enable row level security;
revoke all on public.portpass_invoice_counters from anon, authenticated;

-- 3. Invoices and their lines.
create table if not exists public.portpass_invoices (
  id bigint generated always as identity primary key,
  number text not null unique check (length(number) between 3 and 30),
  organization_id bigint not null references public.organizations(id) on delete restrict,
  -- subscription: a plan period, raised by the daily job. commission: fees
  -- for a month, raised on the 1st. manual: raised by a founder.
  -- historical: something billed before this system (kept with its own number).
  kind text not null check (kind in ('subscription', 'commission', 'manual', 'historical')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  issued_on date not null,
  due_on date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'part_paid', 'paid', 'overdue', 'void')),
  subtotal_cents integer not null,
  vat_cents integer not null default 0 check (vat_cents >= 0),
  total_cents integer not null,
  paid_cents integer not null default 0 check (paid_cents >= 0),
  sent_at timestamptz,
  sent_via text check (sent_via in ('email', 'whatsapp', 'in_person')),
  void_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portpass_invoices_void_has_reason check (status <> 'void' or length(btrim(coalesce(void_reason, ''))) > 0)
);

-- One invoice for one period of one business, however often the job runs.
create unique index if not exists portpass_invoices_period_idx on public.portpass_invoices (organization_id, kind, period_start) where kind in ('subscription', 'commission');
create index if not exists portpass_invoices_org_idx on public.portpass_invoices (organization_id, issued_on desc);
create index if not exists portpass_invoices_status_idx on public.portpass_invoices (status, due_on);

alter table public.portpass_invoices enable row level security;
revoke all on public.portpass_invoices from anon, authenticated;

comment on table public.portpass_invoices is
  'What PortPass has invoiced a business. A number is never reused: a void invoice keeps its number.';

create table if not exists public.portpass_invoice_lines (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.portpass_invoices(id) on delete cascade,
  sort integer not null default 0,
  description text not null check (length(btrim(description)) > 0),
  qty numeric(10, 2) not null default 1,
  unit_cents integer not null,
  amount_cents integer not null,
  source text not null check (source in ('plan', 'setup', 'retainer', 'extra_location', 'commission', 'wedding_fee', 'promote', 'manual')),
  billing_event_id bigint references public.billing_events(id) on delete set null
);

create index if not exists portpass_invoice_lines_invoice_idx on public.portpass_invoice_lines (invoice_id, sort);

alter table public.portpass_invoice_lines enable row level security;
revoke all on public.portpass_invoice_lines from anon, authenticated;

-- 4. Money PortPass received, allocated to an invoice. Part payments are allowed.
create table if not exists public.portpass_receipts (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.portpass_invoices(id) on delete restrict,
  organization_id bigint not null references public.organizations(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('bank_transfer', 'online_banking', 'cash', 'cheque', 'other')),
  reference text,
  received_on date not null,
  recorded_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists portpass_receipts_invoice_idx on public.portpass_receipts (invoice_id);
create index if not exists portpass_receipts_received_idx on public.portpass_receipts (received_on desc);

alter table public.portpass_receipts enable row level security;
revoke all on public.portpass_receipts from anon, authenticated;

comment on table public.portpass_receipts is
  'Money PortPass received from a business against an invoice. Not money from customers: that is the payments table.';

-- 5. Reminder emails already sent, by key, so the daily job can run twice
--    and send once.
create table if not exists public.billing_reminders (
  key text primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);

alter table public.billing_reminders enable row level security;
revoke all on public.billing_reminders from anon, authenticated;

-- 6. Fees per booking or wedding (billing_events, from the growth report
--    migration): a few words on what the fee was for, and the link to the
--    invoice line it was put on.
alter table public.billing_events add column if not exists note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billing_events_invoice_line_fk') then
    alter table public.billing_events
      add constraint billing_events_invoice_line_fk foreign key (invoice_line_id) references public.portpass_invoice_lines(id) on delete set null;
  end if;
end;
$$;

-- 7. A wedding the Desk coordinated, once it has happened: the
--    coordination fee is earned then.
alter table public.wedding_leads add column if not exists completed_on date;
alter table public.wedding_leads add column if not exists desk_coordinated boolean not null default false;

-- 8. Raising an invoice: the number, the invoice, its lines and the link
--    from each fee to its line, in one transaction. Returns null, and uses
--    no number, when that business already has an invoice for that period.
create or replace function public.create_portpass_invoice(
  p_organization_id bigint,
  p_kind text,
  p_period_start date,
  p_period_end date,
  p_issued_on date,
  p_due_on date,
  p_lines jsonb,
  p_created_by uuid default null,
  p_number text default null,
  p_status text default 'draft'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from p_issued_on)::integer;
  v_seq integer;
  v_number text;
  v_id bigint;
  v_total integer;
  v_line jsonb;
  v_line_id bigint;
  v_sort integer := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An invoice needs at least one line';
  end if;
  if p_kind in ('subscription', 'commission') and exists (
    select 1 from public.portpass_invoices i
     where i.organization_id = p_organization_id and i.kind = p_kind and i.period_start = p_period_start
  ) then
    return null;
  end if;

  select coalesce(sum((l->>'amount_cents')::integer), 0) into v_total from jsonb_array_elements(p_lines) as l;

  if p_number is not null then
    v_number := p_number;
  else
    insert into public.portpass_invoice_counters (year, last) values (v_year, 1)
    on conflict (year) do update set last = public.portpass_invoice_counters.last + 1
    returning last into v_seq;
    v_number := 'PP-' || v_year::text || '-' || lpad(v_seq::text, 3, '0');
  end if;

  insert into public.portpass_invoices (number, organization_id, kind, period_start, period_end, issued_on, due_on, status, subtotal_cents, vat_cents, total_cents, created_by)
  values (v_number, p_organization_id, p_kind, p_period_start, p_period_end, p_issued_on, p_due_on, p_status, v_total, 0, v_total, p_created_by)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.portpass_invoice_lines (invoice_id, sort, description, qty, unit_cents, amount_cents, source, billing_event_id)
    values (
      v_id, v_sort, v_line->>'description', coalesce((v_line->>'qty')::numeric, 1), (v_line->>'unit_cents')::integer, (v_line->>'amount_cents')::integer,
      v_line->>'source', nullif(v_line->>'billing_event_id', '')::bigint
    )
    returning id into v_line_id;
    v_sort := v_sort + 1;
    if nullif(v_line->>'billing_event_id', '') is not null then
      update public.billing_events set invoice_line_id = v_line_id, updated_at = now()
       where id = (v_line->>'billing_event_id')::bigint and invoice_line_id is null;
    end if;
  end loop;

  return v_id;
exception
  -- Two runs of the job at the same moment: the second finds the period
  -- (or the number) taken. Everything above is undone with it, so no
  -- number is used up.
  when unique_violation then
    return null;
end;
$$;

revoke all on function public.create_portpass_invoice(bigint, text, date, date, date, date, jsonb, uuid, text, text) from public, anon, authenticated;

-- 9. Recording money received: the receipt and the invoice's paid total in
--    one transaction. A void or draft invoice takes no receipt.
create or replace function public.record_portpass_receipt(
  p_invoice_id bigint,
  p_amount_cents integer,
  p_method text,
  p_reference text,
  p_received_on date,
  p_recorded_by uuid,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.portpass_invoices%rowtype;
  v_id bigint;
  v_paid integer;
begin
  select * into v_invoice from public.portpass_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_invoice.status in ('draft', 'void') then
    raise exception 'NOT_PAYABLE';
  end if;
  insert into public.portpass_receipts (invoice_id, organization_id, amount_cents, method, reference, received_on, recorded_by, note)
  values (p_invoice_id, v_invoice.organization_id, p_amount_cents, p_method, nullif(btrim(coalesce(p_reference, '')), ''), p_received_on, p_recorded_by, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  select coalesce(sum(amount_cents), 0) into v_paid from public.portpass_receipts where invoice_id = p_invoice_id;
  update public.portpass_invoices
     set paid_cents = v_paid,
         status = case when v_paid >= total_cents then 'paid' when status = 'overdue' then 'overdue' else 'part_paid' end,
         updated_at = now()
   where id = p_invoice_id;
  return v_id;
end;
$$;

revoke all on function public.record_portpass_receipt(bigint, integer, text, text, date, uuid, text) from public, anon, authenticated;
