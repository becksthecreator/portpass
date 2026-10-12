-- A double tap on "Record payment" in the Futprep staff inbox recorded the
-- payment twice (found by the security reviews of brief 31 C, PR #209):
-- the app inserted the payment, summed the request's payments and updated
-- the request in three separate calls.
--
-- Now one call does all three, in one transaction, with the request row
-- locked. The form sends one key per payment (a new one after a success),
-- so a double tap or a retry sends the same key: the first call records
-- the payment, a repeat records nothing and answers with that payment.
-- Modelled on payment_request_record_payment (202610070001), which locks
-- its request the same way; a private session can be paid past its price
-- or have none, so a balance check can't catch the repeat here: the key does.
--
-- PortPass never holds money (CLAUDE.md rule 1): this is the record of
-- what a parent paid Futprep directly, in cash or by bank transfer.
--
-- Numbered 0003: 202610230002 is taken by PR #209's migration, already
-- applied to the live database.

alter table public.payments add column if not exists idempotency_key text
  check (idempotency_key is null or length(idempotency_key) between 16 and 64);
create unique index if not exists payments_private_session_idempotency_key
  on public.payments (private_session_request_id, idempotency_key)
  where private_session_request_id is not null and idempotency_key is not null;

-- p: request_id, amount_cents, method, reference, recorded_by,
-- idempotency_key. Returns {payment_id, paid_cents, payment_status}; a
-- repeated key returns its payment and the request's total as it stands.
-- The request has no paid column: the total is the sum of its received
-- payments, as the inbox reads it.
create or replace function public.private_session_record_payment(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  v_req public.private_session_requests;
  v_amount integer := (p->>'amount_cents')::integer;
  v_key text := nullif(p->>'idempotency_key', '');
  v_payment_id bigint;
  v_paid integer;
  v_status text;
  v_repeat boolean;
begin
  if v_key is null or length(v_key) not between 16 and 64 then
    raise exception 'PRIVATE_SESSION_PAYMENT_INVALID_KEY';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'PRIVATE_SESSION_PAYMENT_INVALID_AMOUNT';
  end if;

  -- One payment at a time per request: a second call with the same key
  -- waits here, then finds the first one's payment below.
  select * into v_req from public.private_session_requests
  where id = (p->>'request_id')::bigint
  for update;
  if not found then
    raise exception 'PRIVATE_SESSION_PAYMENT_REQUEST_NOT_FOUND';
  end if;

  select id into v_payment_id from public.payments
  where private_session_request_id = v_req.id and idempotency_key = v_key;
  v_repeat := v_payment_id is not null;

  if not v_repeat then
    insert into public.payments (
      private_session_request_id, amount_cents, method, status, recorded_by,
      note, reference, received_at, idempotency_key
    ) values (
      v_req.id, v_amount, p->>'method', 'received', p->>'recorded_by',
      'Private session', nullif(btrim(coalesce(p->>'reference', '')), ''), now(), v_key
    )
    returning id into v_payment_id;
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid from public.payments
  where private_session_request_id = v_req.id and status = 'received';
  -- As privatePaymentStatus in lib/privateSessions.ts.
  v_status := case
    when v_paid <= 0 then 'unpaid'
    when v_req.price_cents is null or v_paid >= v_req.price_cents then 'paid'
    else 'partial'
  end;

  if not v_repeat then
    update public.private_session_requests
    set payment_status = v_status, updated_at = now()
    where id = v_req.id;
    insert into public.private_session_events (request_id, actor_account, action, note)
    values (v_req.id, p->>'recorded_by', 'payment', format('Recorded %s cents (%s)', v_amount, p->>'method'));
  end if;

  return jsonb_build_object('payment_id', v_payment_id, 'paid_cents', v_paid, 'payment_status', v_status);
end;
$$;

-- Only the server (service role) calls it; Postgres grants EXECUTE to
-- PUBLIC by default.
revoke all on function public.private_session_record_payment(jsonb) from public, anon, authenticated;
grant execute on function public.private_session_record_payment(jsonb) to service_role;
