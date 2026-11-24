import "server-only";
import { ledgerProblem, reversalLines, type LedgerAccountKey, type LedgerLine } from "@/lib/ledger";
import { assertPaymentsLedger } from "@/lib/paymentsFlag";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass Payments, PR 1: posting to and reading the ledger (migration
// 202610280011). Behind PAYMENTS_LEDGER (local stack only until go-live):
// with the flag off every call here throws PAYMENTS_LEDGER_OFF before
// touching the database. No real money moves anywhere in this module; it
// records. The only write is post_ledger_transaction (security definer):
// the tables themselves refuse direct writes from every role.

export type LedgerKind = "charge" | "refund" | "payout" | "payout_settled" | "adjustment" | "reversal";
// app: PortPass's own bookkeeping; sandbox: the stand-in provider;
// provider:<name>: a connected provider (later PRs).
export type LedgerSource = "app" | "sandbox" | `provider:${string}`;

export type PostInput = {
  source: LedgerSource;
  idempotencyKey: string;
  kind: Exclude<LedgerKind, "reversal">;
  organizationId: number | null;
  description: string;
  createdBy: string;
  lines: LedgerLine[];
  isTest?: boolean;
};

// One balanced, idempotent transaction. The same (source, key) with the
// same request returns the first transaction's id and writes nothing; with
// a different request it throws LEDGER_IDEMPOTENCY_CONFLICT.
export async function postLedgerTransaction(input: PostInput): Promise<{ id: number; replayed: boolean }> {
  assertPaymentsLedger();
  const problem = ledgerProblem(input.lines);
  if (problem) throw new Error(`LEDGER_UNBALANCED: ${problem}`);
  return post({ ...input, isTest: input.isTest ?? false, reversesId: null });
}

// Undo a posted transaction exactly, once: a second reversal of the same
// transaction is refused by the database (reverses_id is unique).
export async function reverseLedgerTransaction(input: { transactionId: number; source: LedgerSource; idempotencyKey: string; reason: string; createdBy: string }): Promise<{ id: number; replayed: boolean }> {
  assertPaymentsLedger();
  const { data: tx, error } = await getSupabaseAdmin().from("ledger_transactions").select("id,organization_id,is_test").eq("id", input.transactionId).maybeSingle();
  throwIfSupabaseError(error, "Could not read the ledger transaction");
  if (!tx) throw new Error("LEDGER_NOT_FOUND");
  const lines = await linesOf(input.transactionId);
  return post({
    source: input.source,
    idempotencyKey: input.idempotencyKey,
    kind: "reversal",
    organizationId: tx.organization_id === null ? null : Number(tx.organization_id),
    description: `Reverses #${input.transactionId}: ${input.reason}`.slice(0, 300),
    createdBy: input.createdBy,
    lines: reversalLines(lines),
    isTest: Boolean(tx.is_test),
    reversesId: input.transactionId,
  });
}

async function post(input: Omit<PostInput, "kind" | "isTest"> & { kind: LedgerKind; isTest: boolean; reversesId: number | null }) {
  const { data, error } = await getSupabaseAdmin().rpc("post_ledger_transaction", {
    p_request: {
      source: input.source,
      idempotency_key: input.idempotencyKey,
      kind: input.kind,
      organization_id: input.organizationId,
      description: input.description,
      created_by: input.createdBy,
      is_test: input.isTest,
      reverses_id: input.reversesId,
      entries: input.lines,
    },
  });
  if (error && (error.code === "P0409" || /LEDGER_IDEMPOTENCY_CONFLICT/.test(error.message ?? ""))) throw new Error("LEDGER_IDEMPOTENCY_CONFLICT");
  throwIfSupabaseError(error, "Could not post the ledger transaction");
  const result = data as { id: number; replayed: boolean };
  return { id: Number(result.id), replayed: Boolean(result.replayed) };
}

async function linesOf(transactionId: number): Promise<LedgerLine[]> {
  const { data, error } = await getSupabaseAdmin().from("ledger_entries").select("amount_cents,ledger_accounts!inner(key)").eq("transaction_id", transactionId).order("id");
  throwIfSupabaseError(error, "Could not read the ledger lines");
  return ((data ?? []) as Array<{ amount_cents: number; ledger_accounts: { key: string } | { key: string }[] }>).map((row) => {
    const account = Array.isArray(row.ledger_accounts) ? row.ledger_accounts[0] : row.ledger_accounts;
    return { account: account.key as LedgerAccountKey, amount_cents: Number(row.amount_cents) };
  });
}

// An account's balance in cents (real money and TEST kept apart). An
// account nothing has been posted to yet is 0.
export async function ledgerBalance(account: LedgerAccountKey): Promise<{ balanceCents: number; testBalanceCents: number }> {
  assertPaymentsLedger();
  const { data, error } = await getSupabaseAdmin().from("ledger_balances").select("balance_cents,test_balance_cents").eq("key", account).maybeSingle();
  throwIfSupabaseError(error, "Could not read the ledger balance");
  return { balanceCents: Number(data?.balance_cents ?? 0), testBalanceCents: Number(data?.test_balance_cents ?? 0) };
}
