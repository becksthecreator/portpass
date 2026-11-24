import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { chargeLines } from "@/lib/ledger";
import { ledgerBalance, postLedgerTransaction, reverseLedgerTransaction } from "./ledger";

// PortPass Payments, PR 1, against the local stack CI starts. The ledger is
// append-only, so these TEST rows can't be deleted afterwards: they use a
// TEST business of their own, every transaction is marked is_test, and the
// stack is thrown away after the run. No real money is involved anywhere.
const admin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const tag = crypto.randomUUID().slice(0, 8);
const key = (what: string) => `test-${tag}-${what}`;
let orgId = 0;

beforeAll(async () => {
  process.env.PAYMENTS_LEDGER = "on";
  delete process.env.VERCEL_ENV;
  const { data, error } = await admin().from("organizations").insert({ name: `TEST — ledger ${tag}`, slug: `test-ledger-${tag}`, status: "draft", created_by_admin: true }).select("id").single();
  expect(error).toBeNull();
  orgId = Number(data!.id);
});

const charge = (what: string, gross = 34000, fee = 1700) =>
  postLedgerTransaction({ source: "sandbox", idempotencyKey: key(what), kind: "charge", organizationId: orgId, description: "TEST term fee", createdBy: "TEST", lines: chargeLines({ organizationId: orgId, grossCents: gross, feeCents: fee }), isTest: true });

const rawPost = (request: Record<string, unknown>) => admin().rpc("post_ledger_transaction", { p_request: request });

describe("the payments ledger (PR 1)", () => {
  it("posts a charge: the business is owed the net, PortPass the fee (TEST money only)", async () => {
    const before = await ledgerBalance(`business_payable:${orgId}`);
    const posted = await charge("first");
    expect(posted.replayed).toBe(false);
    const after = await ledgerBalance(`business_payable:${orgId}`);
    expect(after.testBalanceCents - before.testBalanceCents).toBe(32300);
    expect(after.balanceCents).toBe(0);
  });

  it("posts once per (source, key), even sent twice at once", async () => {
    const both = await Promise.allSettled([charge("twice"), charge("twice")]);
    // The racing one is answered as a replay, not an error.
    expect(both.every((r) => r.status === "fulfilled")).toBe(true);
    const { count } = await admin().from("ledger_transactions").select("id", { count: "exact", head: true }).eq("source", "sandbox").eq("idempotency_key", key("twice"));
    expect(count).toBe(1);
    expect((await charge("twice")).replayed).toBe(true);
  });

  it("refuses the same key with a different request (409), and the same key from another source is a different transaction", async () => {
    await charge("conflict", 34000, 1700);
    await expect(charge("conflict", 42000, 2100)).rejects.toThrow("LEDGER_IDEMPOTENCY_CONFLICT");
    const other = await postLedgerTransaction({ source: "app", idempotencyKey: key("conflict"), kind: "adjustment", organizationId: orgId, description: "TEST", createdBy: "TEST", lines: [{ account: "portpass_fees", amount_cents: 100 }, { account: "customer_clearing", amount_cents: -100 }], isTest: true });
    expect(other.replayed).toBe(false);
  });

  it("refuses an unbalanced transaction in the database, not only in the app", async () => {
    const { error } = await rawPost({ source: "app", idempotency_key: key("unbalanced"), kind: "adjustment", organization_id: orgId, description: "TEST", created_by: "TEST", is_test: true, entries: [{ account: "customer_clearing", amount_cents: -100 }, { account: "portpass_fees", amount_cents: 99 }] });
    expect(error).not.toBeNull();
    const { count } = await admin().from("ledger_transactions").select("id", { count: "exact", head: true }).eq("idempotency_key", key("unbalanced"));
    expect(count).toBe(0);
  });

  it("the server itself can't write the tables directly: only the posting function can", async () => {
    const { id } = await charge("locked");
    const lines = await admin().from("ledger_entries").select("id,account_id").eq("transaction_id", id);
    const line = lines.data![0];
    // No insert (not even a balanced pair), update or delete on the tables.
    expect((await admin().from("ledger_entries").insert([{ transaction_id: id, account_id: line.account_id, amount_cents: 5 }, { transaction_id: id, account_id: line.account_id, amount_cents: -5 }])).error).not.toBeNull();
    expect((await admin().from("ledger_entries").update({ amount_cents: 1 }).eq("id", line.id)).error).not.toBeNull();
    expect((await admin().from("ledger_entries").delete().eq("id", line.id)).error).not.toBeNull();
    expect((await admin().from("ledger_transactions").delete().eq("id", id)).error).not.toBeNull();
    expect((await admin().from("ledger_transactions").insert({ source: "app", idempotency_key: key("direct"), request_hash: "0".repeat(32), kind: "adjustment", created_by: "TEST" })).error).not.toBeNull();
  });

  it("a reversal undoes a charge exactly, and only once", async () => {
    const before = await ledgerBalance(`business_payable:${orgId}`);
    const { id } = await charge("to-reverse", 4200, 210);
    await reverseLedgerTransaction({ transactionId: id, source: "app", idempotencyKey: key("reverse-1"), reason: "TEST mistake", createdBy: "TEST" });
    const after = await ledgerBalance(`business_payable:${orgId}`);
    expect(after.testBalanceCents).toBe(before.testBalanceCents);
    await expect(reverseLedgerTransaction({ transactionId: id, source: "app", idempotencyKey: key("reverse-2"), reason: "TEST again", createdBy: "TEST" })).rejects.toThrow();
  });

  it("a reversal that doesn't exactly undo its original is refused", async () => {
    const { id } = await charge("bad-reversal", 5000, 250);
    const { error } = await rawPost({ source: "app", idempotency_key: key("bad-reversal-r"), kind: "reversal", reverses_id: id, organization_id: orgId, description: "TEST", created_by: "TEST", is_test: true,
      entries: [{ account: "customer_clearing", amount_cents: 4000 }, { account: `business_payable:${orgId}`, amount_cents: -4000 }] });
    expect(error).not.toBeNull();
    const wrongOrg = await rawPost({ source: "app", idempotency_key: key("bad-reversal-o"), kind: "reversal", reverses_id: id, organization_id: null, description: "TEST", created_by: "TEST", is_test: true,
      entries: [{ account: "customer_clearing", amount_cents: 5000 }, { account: `business_payable:${orgId}`, amount_cents: -4750 }, { account: "portpass_fees", amount_cents: -250 }] });
    expect(wrongOrg.error).not.toBeNull();
  });

  it("a transaction's payable lines are its own business's, and a charge must name one", async () => {
    const lines = [{ account: "customer_clearing", amount_cents: -1000 }, { account: `business_payable:${orgId}`, amount_cents: 1000 }];
    // Labelled for another business (or none) but crediting this one.
    expect((await rawPost({ source: "app", idempotency_key: key("wrong-org"), kind: "charge", organization_id: orgId + 1000000, description: "TEST", created_by: "TEST", is_test: true, entries: lines })).error).not.toBeNull();
    expect((await rawPost({ source: "app", idempotency_key: key("no-org"), kind: "charge", organization_id: null, description: "TEST", created_by: "TEST", is_test: true, entries: lines })).error).not.toBeNull();
    // Two businesses in one transaction.
    expect((await rawPost({ source: "app", idempotency_key: key("two-orgs"), kind: "adjustment", organization_id: orgId, description: "TEST", created_by: "TEST", is_test: true,
      entries: [{ account: `business_payable:${orgId}`, amount_cents: -500 }, { account: `business_payable:${orgId + 1000000}`, amount_cents: 500 }] })).error).not.toBeNull();
  });

  it("a browser can't read the ledger or post to it", async () => {
    const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const read = await browser.from("ledger_entries").select("id").limit(1);
    expect(read.data ?? []).toEqual([]);
    const { error } = await browser.rpc("post_ledger_transaction", { p_request: { source: "app", idempotency_key: key("browser"), kind: "adjustment", created_by: "x", entries: [] } });
    expect(error?.code).toBe("42501");
  });

  it("with the flag off, or on a Vercel preview, nothing is read or written", async () => {
    process.env.PAYMENTS_LEDGER = "off";
    try {
      await expect(charge("flag-off")).rejects.toThrow("PAYMENTS_LEDGER_OFF");
      await expect(ledgerBalance("portpass_fees")).rejects.toThrow("PAYMENTS_LEDGER_OFF");
    } finally {
      process.env.PAYMENTS_LEDGER = "on";
    }
    process.env.VERCEL_ENV = "preview";
    try {
      await expect(charge("on-preview")).rejects.toThrow("PAYMENTS_LEDGER_OFF");
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });
});
