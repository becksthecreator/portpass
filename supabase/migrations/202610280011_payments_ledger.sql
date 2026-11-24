-- PortPass Payments, PR 1: the ledger core (design note
-- engineering-payments-ledger-design.md, 24 Nov 2026). Software only: no
-- real money moves, and nothing in the app reads or writes these tables
-- while PAYMENTS_LEDGER is off (lib/paymentsFlag.ts), which it is in
-- production.
--
-- Double-entry and append-only:
--   * every movement is one ledger_transactions row with two or more
--     ledger_entries lines whose amounts sum to zero (debit +, credit -),
--     checked by the database at commit, not only by the app;
--   * nothing is ever updated or deleted: a mistake is corrected with a
--     reversing transaction;
--   * balances are sums over entries (ledger_balances), so no stored
--     running balance can drift;
--   * money is integer cents, BSD only;
--   * every transaction carries a unique idempotency key, so a retried
--     webhook, import or run posts once.
-- Only the server (service_role) can read or write: browser roles are
-- denied by row-level security, and the posting function is service_role
-- only.

create table public.ledger_accounts (
  id bigint generated always as identity primary key,
  -- customer_clearing | portpass_fees | payouts_in_transit | refunds_payable
  -- | bank:<name> | business_payable:<organization id>
  key text not null unique check (key ~ '^(customer_clearing|portpass_fees|payouts_in_transit|refunds_payable|bank:[a-z0-9_-]{1,40}|business_payable:[0-9]{1,18})$'),
  kind text not null check (kind in ('customer_clearing', 'portpass_fees', 'payouts_in_transit', 'refunds_payable', 'bank', 'business_payable')),
  organization_id bigint references public.organizations(id),
  currency text not null default 'BSD' check (currency = 'BSD'),
  created_at timestamptz not null default now(),
  check ((kind = 'business_payable') = (organization_id is not null))
);

create table public.ledger_transactions (
  id bigint generated always as identity primary key,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 128),
  kind text not null check (kind in ('charge', 'refund', 'payout', 'payout_settled', 'adjustment', 'reversal')),
  organization_id bigint references public.organizations(id),
  description text not null default '' check (char_length(description) <= 300),
  -- A reversal names the transaction it undoes, once.
  reverses_id bigint unique references public.ledger_transactions(id),
  is_test boolean not null default false,
  created_by text not null check (char_length(created_by) between 1 and 120),
  created_at timestamptz not null default now(),
  check ((kind = 'reversal') = (reverses_id is not null))
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.ledger_transactions(id),
  account_id bigint not null references public.ledger_accounts(id),
  amount_cents bigint not null check (amount_cents <> 0),
  created_at timestamptz not null default now()
);
create index ledger_entries_transaction_idx on public.ledger_entries (transaction_id);
create index ledger_entries_account_idx on public.ledger_entries (account_id);
create index ledger_transactions_org_idx on public.ledger_transactions (organization_id, created_at);

-- Append-only: no update or delete, ever, on any of the three.
create or replace function public.ledger_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'The ledger is append-only: post a reversing transaction instead of changing %', tg_table_name;
end;
$$;
create trigger ledger_accounts_append_only before update or delete on public.ledger_accounts for each row execute function public.ledger_append_only();
create trigger ledger_transactions_append_only before update or delete on public.ledger_transactions for each row execute function public.ledger_append_only();
create trigger ledger_entries_append_only before update or delete on public.ledger_entries for each row execute function public.ledger_append_only();

-- Balanced: at commit, every transaction that gained lines has at least two
-- lines and they sum to zero. Deferred, so a transaction's lines can be
-- written one by one inside the same database transaction.
create or replace function public.ledger_check_balanced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sum bigint;
  v_lines integer;
begin
  select coalesce(sum(amount_cents), 0), count(*) into v_sum, v_lines
    from public.ledger_entries where transaction_id = new.transaction_id;
  if v_lines < 2 or v_sum <> 0 then
    raise exception 'Ledger transaction % is not balanced (% lines, sum %)', new.transaction_id, v_lines, v_sum;
  end if;
  return null;
end;
$$;
create constraint trigger ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.ledger_check_balanced();

-- A transaction with no lines at all is refused too.
create or replace function public.ledger_check_has_entries()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.ledger_entries where transaction_id = new.id) then
    raise exception 'Ledger transaction % has no entries', new.id;
  end if;
  return null;
end;
$$;
create constraint trigger ledger_transactions_have_entries
  after insert on public.ledger_transactions
  deferrable initially deferred
  for each row execute function public.ledger_check_has_entries();

-- Balances, worked out from the entries (never stored).
create view public.ledger_balances
with (security_invoker = true) as
select a.id as account_id, a.key, a.kind, a.organization_id,
       coalesce(sum(e.amount_cents) filter (where not t.is_test), 0)::bigint as balance_cents,
       coalesce(sum(e.amount_cents) filter (where t.is_test), 0)::bigint as test_balance_cents
  from public.ledger_accounts a
  left join public.ledger_entries e on e.account_id = a.id
  left join public.ledger_transactions t on t.id = e.transaction_id
 group by a.id, a.key, a.kind, a.organization_id;

-- Posting: one call writes the transaction and its lines, creating any
-- account it names (a business's payable account on first use). Replaying
-- an idempotency key returns the first transaction and writes nothing.
-- p_entries: [{"account": "<key>", "amount_cents": <non-zero integer>}, ...]
create or replace function public.post_ledger_transaction(
  p_idempotency_key text,
  p_kind text,
  p_organization_id bigint,
  p_description text,
  p_created_by text,
  p_entries jsonb,
  p_is_test boolean default false,
  p_reverses_id bigint default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_existing bigint;
  v_tx bigint;
  v_entry jsonb;
  v_key text;
  v_amount bigint;
  v_kind text;
  v_org bigint;
  v_account bigint;
  v_sum bigint := 0;
  v_lines integer := 0;
begin
  select id into v_existing from public.ledger_transactions where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'replayed', true);
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'post_ledger_transaction: entries must be an array';
  end if;

  insert into public.ledger_transactions (idempotency_key, kind, organization_id, description, created_by, is_test, reverses_id)
  values (p_idempotency_key, p_kind, p_organization_id, coalesce(p_description, ''), p_created_by, coalesce(p_is_test, false), p_reverses_id)
  returning id into v_tx;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_key := v_entry->>'account';
    v_amount := (v_entry->>'amount_cents')::bigint;
    if v_key is null or v_amount is null or v_amount = 0 then
      raise exception 'post_ledger_transaction: each entry needs an account and a non-zero amount';
    end if;
    v_kind := split_part(v_key, ':', 1);
    v_org := case when v_kind = 'business_payable' then split_part(v_key, ':', 2)::bigint else null end;
    insert into public.ledger_accounts (key, kind, organization_id)
    values (v_key, v_kind, v_org)
    on conflict (key) do nothing;
    select id into v_account from public.ledger_accounts where key = v_key;
    insert into public.ledger_entries (transaction_id, account_id, amount_cents) values (v_tx, v_account, v_amount);
    v_sum := v_sum + v_amount;
    v_lines := v_lines + 1;
  end loop;

  -- The deferred trigger checks this at commit too; saying it here gives a
  -- clear answer before anything is committed.
  if v_lines < 2 or v_sum <> 0 then
    raise exception 'post_ledger_transaction: entries must be two or more lines summing to zero (% lines, sum %)', v_lines, v_sum;
  end if;
  return jsonb_build_object('id', v_tx, 'replayed', false);
end;
$$;

-- Server only.
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
create policy ledger_accounts_browser_roles_denied on public.ledger_accounts as restrictive for all to anon, authenticated using (false) with check (false);
create policy ledger_transactions_browser_roles_denied on public.ledger_transactions as restrictive for all to anon, authenticated using (false) with check (false);
create policy ledger_entries_browser_roles_denied on public.ledger_entries as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on public.ledger_accounts, public.ledger_transactions, public.ledger_entries, public.ledger_balances from anon, authenticated;
revoke all on function public.post_ledger_transaction(text, text, bigint, text, text, jsonb, boolean, bigint) from public, anon, authenticated;
grant execute on function public.post_ledger_transaction(text, text, bigint, text, text, jsonb, boolean, bigint) to service_role;
revoke all on function public.ledger_append_only(), public.ledger_check_balanced(), public.ledger_check_has_entries() from public, anon, authenticated;

comment on table public.ledger_entries is 'Double-entry lines (debit +, credit -), append-only; each transaction sums to zero (checked at commit). PortPass Payments, behind PAYMENTS_LEDGER.';
comment on function public.post_ledger_transaction(text, text, bigint, text, text, jsonb, boolean, bigint) is 'Posts one balanced, idempotent ledger transaction. Called by db/ledger.ts only.';
