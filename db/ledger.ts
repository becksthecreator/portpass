import "server-only";
import { ledgerProblem, reversalLines, type LedgerAccountKey, type LedgerLine } from "@/lib/ledger";
import { assertPaymentsLedger } from "@/lib/paymentsFlag";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// PortPass Payments, PR 1: posting to and reading the ledger (migration
// 202610280011). Behind PAYMENTS_LEDGER: with the flag off every call here
// throws PAYMENTS_LEDGER_OFF before touching the database. No real money
// moves anywhere in this module; it records.

export type LedgerKind = "charge" | "refund" | "payout" | "payout_settled" | "adjustment" | "reversal";

export type PostInput = {
  idempotencyKey: string;
  kind: Exclude<LedgerKind, "reversal">;
  organizationId: number | null;
  description: string;
  createdBy: string;
  lines: LedgerLine[];
  isTest?: boolean;
};

// One balanced, idempotent transaction. A replayed key returns the first
// transaction's id and writes nothing.
export async function postLedgerTransaction(input: PostInput): Promise<{ id: number; replayed: boolean }> {
  assertPaymentsLedger();
  const problem = ledgerProblem(input.lines);
  if (problem) throw new Error(`LEDGER_UNBALANCED: ${problem}`);
  return post(input.idempotencyKey, input.kind, input.organizationId, input.description, input.createdBy, input.lines, input.isTest ?? false, null);
}

// Undo a posted transaction exactly, once: a second reversal of the same
// transaction is refused by the database (reverses_id is unique).
export async function reverseLedgerTransaction(input: { transactionId: number; idempotencyKey: string; reason: string; createdBy: string }): Promise<{ id: number; replayed: boolean }> {
  assertPaymentsLedger();
  const db = getSupabaseAdmin();
  const { data: tx, error } = await db.from("ledger_transactions").select("id,organization_id,is_test").eq("id", input.transactionId).maybeSingle();
  throwIfSupabaseError(error, "Could not read the ledger transaction");
  if (!tx) throw new Error("LEDGER_NOT_FOUND");
  const lines = await linesOf(input.transactionId);
  return post(input.idempotencyKey, "reversal", tx.organization_id === null ? null : Number(tx.organization_id), `Reverses #${input.transactionId}: ${input.reason}`.slice(0, 300), input.createdBy, reversalLines(lines), Boolean(tx.is_test), input.transactionId);
}

async function post(key: string, kind: LedgerKind, organizationId: number | null, description: string, createdBy: string, lines: LedgerLine[], isTest: boolean, reversesId: number | null) {
  const { data, error } = await getSupabaseAdmin().rpc("post_ledger_transaction", {
    p_idempotency_key: key,
    p_kind: kind,
    p_organization_id: organizationId,
    p_description: description,
    p_created_by: createdBy,
    p_entries: lines,
    p_is_test: isTest,
    p_reverses_id: reversesId,
  });
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
