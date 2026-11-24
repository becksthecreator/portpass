-- PortPass Payments, PR 1: the ledger core (design note
-- engineering-payments-ledger-design.md, 24 Nov 2026, with Security & QA's
-- review security-qa-payments-design-review.md). Software only: no real
-- money moves, and nothing in the app reads or writes these tables unless
-- PAYMENTS_LEDGER is on, which is allowed on the local stack only until
-- go-live (lib/paymentsFlag.ts).
--
-- Double-entry and append-only:
--   * every movement is one ledger_transactions row with two or more
--     ledger_entries lines whose amounts sum to zero (debit +, credit -),
--     checked by the database at commit;
--   * a transaction's lines are all written in the database transaction
--     that created it: no line can be added to an old one;
--   * a transaction belongs to at most one business, and every payable
--     line in it is that business's; charges, refunds and payouts name it;
--   * nothing is ever updated, deleted or truncated: a mistake is corrected
--     with a reversing transaction, which must negate its original exactly;
--   * balances are sums over entries (ledger_balances), never stored;
--   * money is integer cents, BSD only;
--   * idempotency is per (source, key), with a hash of the request: the
--     same key with the same request replays, a different request is
--     refused (LEDGER_IDEMPOTENCY_CONFLICT, errcode P0409).
-- The only way to write is post_ledger_transaction (security definer).
-- Every role, service_role included, has insert, update, delete and
-- truncate revoked on the tables; browser roles are denied everything by
-- row-level security.

create table public.ledger_accounts (
  id bigint generated always as identity primary key,
  -- customer_clearing | portpass_fees | payouts_in_transit | refunds_payable
  -- | bank:<name> | business_payable:<organization id>
  key text not null unique check (key ~ '^(customer_clearing|portpass_fees|payouts_in_transit|refunds_payable|bank:[a-z0-9_-]{1,40}|business_payable:[1-9][0-9]{0,17})$'),
  kind text not null check (kind in ('customer_clearing', 'portpass_fees', 'payouts_in_transit', 'refunds_payable', 'bank', 'business_payable')),
  organization_id bigint references public.organizations(id),
  currency text not null default 'BSD' check (currency = 'BSD'),
  created_at timestamptz not null default now(),
  check ((kind = 'business_payable') = (organization_id is not null)),
  -- The kind is the key's prefix, and a payable's business is the key's id.
  check (kind = split_part(key, ':', 1)),
  check (organization_id is null or key = 'business_payable:' || organization_id::text)
);

create table public.ledger_transactions (
  id bigint generated always as identity primary key,
  -- Where the request came from: the app itself, the sandbox provider, or
  -- a named provider once one is connected. A real provider never pays out
  -- money that came from the sandbox (enforced in the payouts PR).
  source text not null check (source ~ '^(app|sandbox|provider:[a-z0-9_-]{1,40})$'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_hash text not null check (char_length(request_hash) = 32),
  kind text not null check (kind in ('charge', 'refund', 'payout', 'payout_settled', 'adjustment', 'reversal')),
  organization_id bigint references public.organizations(id),
  description text not null default '' check (char_length(description) <= 300),
  -- A reversal names the transaction it undoes, once.
  reverses_id bigint unique references public.ledger_transactions(id),
  is_test boolean not null default false,
  created_by text not null check (char_length(created_by) between 1 and 120),
  -- The database transaction that wrote it: its lines must come from the same one.
  created_xid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  unique (source, idempotency_key),
  check ((kind = 'reversal') = (reverses_id is not null)),
  check (kind not in ('charge', 'refund', 'payout', 'payout_settled') or organization_id is not null)
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.ledger_transactions(id),
  account_id bigint not null references public.ledger_accounts(id),
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000000),
  created_at timestamptz not null default now()
);
create index ledger_entries_transaction_idx on public.ledger_entries (transaction_id);
create index ledger_entries_account_idx on public.ledger_entries (account_id);
create index ledger_transactions_org_idx on public.ledger_transactions (organization_id, created_at);

-- Append-only: no update or delete on any row, and no truncate.
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
create trigger ledger_accounts_no_truncate before truncate on public.ledger_accounts for each statement execute function public.ledger_append_only();
create trigger ledger_transactions_no_truncate before truncate on public.ledger_transactions for each statement execute function public.ledger_append_only();
create trigger ledger_entries_no_truncate before truncate on public.ledger_entries for each statement execute function public.ledger_append_only();

-- Balanced, checked at commit for every transaction that gained a line:
-- two or more lines, summing to zero, all in one currency, and written in
-- the same database transaction as the transaction row itself.
create or replace function public.ledger_check_balanced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sum bigint;
  v_lines integer;
  v_currencies integer;
  v_xid bigint;
begin
  select created_xid into v_xid from public.ledger_transactions where id = new.transaction_id;
  if v_xid is distinct from txid_current() then
    raise exception 'Ledger transaction % is closed: lines can only be written with it', new.transaction_id;
  end if;
  select coalesce(sum(e.amount_cents), 0), count(*), count(distinct a.currency)
    into v_sum, v_lines, v_currencies
    from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id
   where e.transaction_id = new.transaction_id;
  if v_lines < 2 or v_sum <> 0 or v_currencies <> 1 then
    raise exception 'Ledger transaction % is not balanced (% lines, sum %, % currencies)', new.transaction_id, v_lines, v_sum, v_currencies;
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

-- Balances, worked out from the entries (never stored). TEST money is kept
-- apart from real money.
create view public.ledger_balances
with (security_invoker = true) as
select a.id as account_id, a.key, a.kind, a.organization_id,
       coalesce(sum(e.amount_cents) filter (where not t.is_test), 0)::bigint as balance_cents,
       coalesce(sum(e.amount_cents) filter (where t.is_test), 0)::bigint as test_balance_cents
  from public.ledger_accounts a
  left join public.ledger_entries e on e.account_id = a.id
  left join public.ledger_transactions t on t.id = e.transaction_id
 group by a.id, a.key, a.kind, a.organization_id;

-- Posting: the only way to write. One call writes the transaction and its
-- lines, creating any account it names (a business's payable account on
-- first use), under a lock for the business it belongs to. Replaying
-- (source, key) with the same request returns the first transaction and
-- writes nothing; with a different request it is refused.
-- p_request: {"source", "idempotency_key", "kind", "organization_id",
--   "description", "created_by", "is_test", "reverses_id",
--   "entries": [{"account": "<key>", "amount_cents": <non-zero integer>}, ...]}
create or replace function public.post_ledger_transaction(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  v_source text := p_request->>'source';
  v_key text := p_request->>'idempotency_key';
  v_entries jsonb := p_request->'entries';
  v_kind_tx text := p_request->>'kind';
  v_tx_org bigint := nullif(p_request->>'organization_id', '')::bigint;
  v_reverses bigint := nullif(p_request->>'reverses_id', '')::bigint;
  v_is_test boolean := coalesce((p_request->>'is_test')::boolean, false);
  v_hash text;
  v_existing record;
  v_payables bigint[];
  v_tx bigint;
  v_entry jsonb;
  v_account_key text;
  v_amount bigint;
  v_kind text;
  v_org bigint;
  v_account bigint;
  v_sum bigint := 0;
  v_lines integer := 0;
begin
  if v_source is null or v_key is null or v_entries is null or jsonb_typeof(v_entries) <> 'array' then
    raise exception 'post_ledger_transaction: bad request';
  end if;
  -- The request's own fingerprint: jsonb is stored in a normal form, so the
  -- same request always hashes the same.
  v_hash := md5((p_request - 'idempotency_key')::text);

  select id, request_hash into v_existing from public.ledger_transactions where source = v_source and idempotency_key = v_key;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'LEDGER_IDEMPOTENCY_CONFLICT' using errcode = 'P0409';
    end if;
    return jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  -- A transaction belongs to at most one business, and every payable line
  -- in it is that business's: a charge labelled for one business can't
  -- credit another. Charges, refunds and payouts must name their business.
  -- (The account key's own check refuses a malformed id when it is written.)
  select coalesce(array_agg(distinct split_part(e->>'account', ':', 2)), '{}')
    into v_payables
    from jsonb_array_elements(v_entries) e
   where split_part(e->>'account', ':', 1) = 'business_payable';
  if v_kind_tx in ('charge', 'refund', 'payout', 'payout_settled') and v_tx_org is null then
    raise exception 'post_ledger_transaction: a % must name its business', v_kind_tx;
  end if;
  if cardinality(v_payables) > 1 or (cardinality(v_payables) = 1 and v_payables[1] is distinct from v_tx_org::text) then
    raise exception 'post_ledger_transaction: payable lines must all be the transaction''s own business';
  end if;

  -- One business at a time.
  if cardinality(v_payables) = 1 then
    perform pg_advisory_xact_lock(hashtext('ledger_payable'), hashtext(v_payables[1]));
  end if;

  begin
    insert into public.ledger_transactions (source, idempotency_key, request_hash, kind, organization_id, description, created_by, is_test, reverses_id)
    values (v_source, v_key, v_hash, v_kind_tx, v_tx_org, coalesce(p_request->>'description', ''), p_request->>'created_by', v_is_test, v_reverses)
    returning id into v_tx;
  exception when unique_violation then
    -- Another call with the same (source, key) got there first: answer as
    -- a replay (or a conflict), not as an error. Any other uniqueness (a
    -- second reversal of the same transaction) is raised as it is.
    select id, request_hash into v_existing from public.ledger_transactions where source = v_source and idempotency_key = v_key;
    if not found then
      raise;
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'LEDGER_IDEMPOTENCY_CONFLICT' using errcode = 'P0409';
    end if;
    return jsonb_build_object('id', v_existing.id, 'replayed', true);
  end;

  for v_entry in select * from jsonb_array_elements(v_entries) loop
    v_account_key := v_entry->>'account';
    if v_account_key is null or jsonb_typeof(v_entry->'amount_cents') <> 'number' then
      raise exception 'post_ledger_transaction: each entry needs an account and an amount';
    end if;
    v_amount := (v_entry->>'amount_cents')::bigint;
    if v_amount = 0 then
      raise exception 'post_ledger_transaction: amounts must be non-zero';
    end if;
    v_kind := split_part(v_account_key, ':', 1);
    v_org := case when v_kind = 'business_payable' then split_part(v_account_key, ':', 2)::bigint else null end;
    insert into public.ledger_accounts (key, kind, organization_id)
    values (v_account_key, v_kind, v_org)
    on conflict (key) do nothing;
    select id into v_account from public.ledger_accounts where key = v_account_key;
    insert into public.ledger_entries (transaction_id, account_id, amount_cents) values (v_tx, v_account, v_amount);
    v_sum := v_sum + v_amount;
    v_lines := v_lines + 1;
  end loop;

  -- The deferred trigger checks this at commit too; saying it here gives a
  -- clear answer before anything is committed.
  if v_lines < 2 or v_sum <> 0 then
    raise exception 'post_ledger_transaction: entries must be two or more lines summing to zero (% lines, sum %)', v_lines, v_sum;
  end if;

  -- A reversal must undo its original exactly: same business, same TEST
  -- flag, not itself a reversal, and per account the negative of the
  -- original's amounts.
  if v_kind_tx = 'reversal' then
    if not exists (
      select 1 from public.ledger_transactions o
       where o.id = v_reverses
         and o.organization_id is not distinct from v_tx_org
         and o.is_test = v_is_test
         and o.kind <> 'reversal'
    ) then
      raise exception 'post_ledger_transaction: a reversal must match its original';
    end if;
    if exists (
      select 1 from (
        select account_id, sum(amount_cents) as total from public.ledger_entries
         where transaction_id in (v_tx, v_reverses)
         group by account_id
      ) t where t.total <> 0
    ) then
      raise exception 'post_ledger_transaction: a reversal must negate its original exactly';
    end if;
  end if;
  return jsonb_build_object('id', v_tx, 'replayed', false);
end;
$$;

-- Row-level security: browser roles see and write nothing.
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
create policy ledger_accounts_browser_roles_denied on public.ledger_accounts as restrictive for all to anon, authenticated using (false) with check (false);
create policy ledger_transactions_browser_roles_denied on public.ledger_transactions as restrictive for all to anon, authenticated using (false) with check (false);
create policy ledger_entries_browser_roles_denied on public.ledger_entries as restrictive for all to anon, authenticated using (false) with check (false);

-- Privileges: nobody writes the tables directly, service_role included;
-- the server reads (select) and posts only through the function.
revoke all on public.ledger_accounts, public.ledger_transactions, public.ledger_entries, public.ledger_balances from public, anon, authenticated;
revoke insert, update, delete, truncate on public.ledger_accounts, public.ledger_transactions, public.ledger_entries from service_role;
grant select on public.ledger_accounts, public.ledger_transactions, public.ledger_entries, public.ledger_balances to service_role;
revoke all on function public.post_ledger_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.post_ledger_transaction(jsonb) to service_role;
revoke all on function public.ledger_append_only(), public.ledger_check_balanced(), public.ledger_check_has_entries() from public, anon, authenticated;

comment on table public.ledger_entries is 'Double-entry lines (debit +, credit -), append-only; each transaction sums to zero (checked at commit). PortPass Payments, behind PAYMENTS_LEDGER.';
comment on function public.post_ledger_transaction(jsonb) is 'The only way to write the ledger: one balanced, idempotent transaction per (source, key), payable lines bound to its business. Called by db/ledger.ts only.';
