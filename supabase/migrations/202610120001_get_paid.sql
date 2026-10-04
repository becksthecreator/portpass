-- Get paid (brief 18, part E): every business says how it is paid before it
-- can send a payment request, and can send itself one TEST request to see
-- the whole loop once.

-- 1. The methods a business has chosen to accept. Cash, bank transfer and a
--    Kanoo wallet transfer the customer sends from their own app. Cards are
--    not a choice here: they don't exist yet.
alter table public.organization_payment_settings
  add column if not exists accepted_methods text[] not null default '{}';

alter table public.organization_payment_settings drop constraint if exists organization_payment_settings_accepted_methods_known;
alter table public.organization_payment_settings add constraint organization_payment_settings_accepted_methods_known
  check (accepted_methods <@ array['cash', 'bank_transfer', 'kanoo_wallet_manual']::text[]);

-- A business that had already said how it is paid keeps exactly what it
-- offered before this column existed: cash, bank transfer where it gave
-- bank details, Kanoo where it gave a handle. A row with no details at all
-- (made only to number requests) stays empty: it hasn't said how it is paid.
update public.organization_payment_settings
   set accepted_methods = array_remove(array[
         'cash',
         case when bank_name <> '' or transfer_instructions <> '' then 'bank_transfer' end,
         case when kanoo_handle_or_phone <> '' then 'kanoo_wallet_manual' end
       ], null)
 where accepted_methods = '{}'
   and (bank_name <> '' or transfer_instructions <> '' or kanoo_handle_or_phone <> '' or cash_note <> '');

-- 2. A TEST request: one the owner sends to their own email to see the
--    customer's page and mark it paid. It is never money: no payment row is
--    ever written for it, and every total leaves it out.
alter table public.payment_requests add column if not exists is_test boolean not null default false;

create index if not exists payment_requests_test_idx on public.payment_requests (organization_id) where is_test;

-- Same as before, plus is_test.
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
    created_by, created_by_name, is_test
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
    coalesce(p->>'created_by_name', ''),
    coalesce((p->>'is_test')::boolean, false)
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.payment_request_create(jsonb) from public, anon, authenticated;

-- "Mark paid" on a TEST request: the request shows as paid, and that is
-- all. No payment row, no receipt number, nothing in any total.
create or replace function public.payment_request_complete_test(p_org bigint, p_id bigint)
returns public.payment_requests
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.payment_requests;
begin
  select * into v_row from public.payment_requests where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'PAYMENT_REQUEST_NOT_FOUND';
  end if;
  if not v_row.is_test then
    raise exception 'PAYMENT_REQUEST_NOT_A_TEST';
  end if;
  if v_row.status = 'void' then
    raise exception 'PAYMENT_REQUEST_VOID';
  end if;
  update public.payment_requests set paid_cents = total_cents where id = p_id returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.payment_request_complete_test(bigint, bigint) from public, anon, authenticated;

-- A real payment can never be recorded against a TEST request, whatever
-- screen or script tries.
create or replace function public.payments_refuse_test_request()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.payment_request_id is not null and exists (select 1 from public.payment_requests r where r.id = new.payment_request_id and r.is_test) then
    raise exception 'PAYMENT_REQUEST_TEST_REQUEST';
  end if;
  return new;
end;
$$;

revoke all on function public.payments_refuse_test_request() from public, anon, authenticated;

drop trigger if exists payments_refuse_test_request on public.payments;
create trigger payments_refuse_test_request
  before insert or update of payment_request_id on public.payments
  for each row execute function public.payments_refuse_test_request();
