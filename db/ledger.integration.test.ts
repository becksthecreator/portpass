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
  const { data, error } = await admin().from("organizations").insert({ name: `TEST — ledger ${tag}`, slug: `test-ledger-${tag}`, status: "draft", created_by_admin: true }).select("id").single();
  expect(error).toBeNull();
  orgId = Number(data!.id);
});

const charge = (what: string, gross = 34000, fee = 1700) =>
  postLedgerTransaction({ idempotencyKey: key(what), kind: "charge", organizationId: orgId, description: "TEST term fee", createdBy: "TEST", lines: chargeLines({ organizationId: orgId, grossCents: gross, feeCents: fee }), isTest: true });

describe("the payments ledger (PR 1)", () => {
  it("posts a charge: the business is owed the net, PortPass the fee (TEST money only)", async () => {
    const before = await ledgerBalance(`business_payable:${orgId}`);
    const posted = await charge("first");
    expect(posted.replayed).toBe(false);
    const after = await ledgerBalance(`business_payable:${orgId}`);
    expect(after.testBalanceCents - before.testBalanceCents).toBe(32300);
    expect(after.balanceCents).toBe(0);
  });

  it("posts once per idempotency key, even sent twice at once", async () => {
    const [a, b] = await Promise.allSettled([charge("twice"), charge("twice")]);
    const ok = [a, b].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: number; replayed: boolean }>[];
    // Both may answer (one posting, one replaying), or the racing one may be
    // refused by the unique key; either way there is one transaction.
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const { count } = await admin().from("ledger_transactions").select("id", { count: "exact", head: true }).eq("idempotency_key", key("twice"));
    expect(count).toBe(1);
    expect((await charge("twice")).replayed).toBe(true);
  });

  it("refuses an unbalanced transaction in the database, not only in the app", async () => {
    const { error } = await admin().rpc("post_ledger_transaction", {
      p_idempotency_key: key("unbalanced"), p_kind: "adjustment", p_organization_id: orgId, p_description: "TEST", p_created_by: "TEST",
      p_entries: [{ account: "customer_clearing", amount_cents: -100 }, { account: "portpass_fees", amount_cents: 99 }], p_is_test: true, p_reverses_id: null,
    });
    expect(error).not.toBeNull();
    const { count } = await admin().from("ledger_transactions").select("id", { count: "exact", head: true }).eq("idempotency_key", key("unbalanced"));
    expect(count).toBe(0);
  });

  it("never lets a line or a transaction be changed or deleted", async () => {
    const { id } = await charge("locked");
    const lines = await admin().from("ledger_entries").select("id").eq("transaction_id", id);
    const lineId = Number(lines.data![0].id);
    expect((await admin().from("ledger_entries").update({ amount_cents: 1 }).eq("id", lineId)).error).not.toBeNull();
    expect((await admin().from("ledger_entries").delete().eq("id", lineId)).error).not.toBeNull();
    expect((await admin().from("ledger_transactions").delete().eq("id", id)).error).not.toBeNull();
  });

  it("a reversal undoes a charge exactly, and only once", async () => {
    const before = await ledgerBalance(`business_payable:${orgId}`);
    const { id } = await charge("to-reverse", 4200, 210);
    await reverseLedgerTransaction({ transactionId: id, idempotencyKey: key("reverse-1"), reason: "TEST mistake", createdBy: "TEST" });
    const after = await ledgerBalance(`business_payable:${orgId}`);
    expect(after.testBalanceCents).toBe(before.testBalanceCents);
    await expect(reverseLedgerTransaction({ transactionId: id, idempotencyKey: key("reverse-2"), reason: "TEST again", createdBy: "TEST" })).rejects.toThrow();
  });

  it("a browser can't read the ledger or post to it", async () => {
    const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const read = await browser.from("ledger_entries").select("id").limit(1);
    expect(read.data ?? []).toEqual([]);
    const { error } = await browser.rpc("post_ledger_transaction", { p_idempotency_key: key("browser"), p_kind: "adjustment", p_organization_id: null, p_description: "", p_created_by: "x", p_entries: [], p_is_test: true, p_reverses_id: null });
    expect(error?.code).toBe("42501");
  });

  it("with the flag off, nothing is read or written", async () => {
    process.env.PAYMENTS_LEDGER = "off";
    try {
      await expect(charge("flag-off")).rejects.toThrow("PAYMENTS_LEDGER_OFF");
      await expect(ledgerBalance("portpass_fees")).rejects.toThrow("PAYMENTS_LEDGER_OFF");
    } finally {
      process.env.PAYMENTS_LEDGER = "on";
    }
  });
});
