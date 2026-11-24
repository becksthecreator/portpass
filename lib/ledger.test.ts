import { describe, expect, it } from "vitest";
import { bankAccount, businessPayable, chargeLines, feeCents, ledgerProblem, reversalLines } from "./ledger";
import { paymentsLedgerEnabled } from "./paymentsFlag";

describe("the payments ledger's rules (design note, section 2)", () => {
  it("a $340 term fee with a 5% fee: the business is owed $323, PortPass earns $17, and it balances", () => {
    const lines = chargeLines({ organizationId: 42, grossCents: 34000, feeCents: 1700 });
    expect(lines).toEqual([
      { account: "customer_clearing", amount_cents: -34000 },
      { account: "business_payable:42", amount_cents: 32300 },
      { account: "portpass_fees", amount_cents: 1700 },
    ]);
    expect(ledgerProblem(lines)).toBeNull();
  });

  it("no fee: no fee line", () => {
    expect(chargeLines({ organizationId: 7, grossCents: 3400, feeCents: 0 })).toHaveLength(2);
  });

  it("refuses an unbalanced, one-line, fractional, zero or unknown-account set", () => {
    expect(ledgerProblem([{ account: "customer_clearing", amount_cents: -100 }, { account: "portpass_fees", amount_cents: 99 }])).toMatch(/balance/);
    expect(ledgerProblem([{ account: "portpass_fees", amount_cents: 0 }])).toMatch(/two lines/);
    expect(ledgerProblem([{ account: "customer_clearing", amount_cents: -1.5 }, { account: "portpass_fees", amount_cents: 1.5 }])).toMatch(/whole/);
    expect(ledgerProblem([{ account: "wallet" as never, amount_cents: -1 }, { account: "portpass_fees", amount_cents: 1 }])).toMatch(/Unknown/);
  });

  it("a reversal undoes a transaction exactly", () => {
    const lines = chargeLines({ organizationId: 42, grossCents: 34000, feeCents: 1700 });
    const back = reversalLines(lines);
    expect(ledgerProblem(back)).toBeNull();
    expect([...lines, ...back].reduce((sum, l) => sum + l.amount_cents, 0)).toBe(0);
  });

  it("works out the fee from the plan, rounded to the cent, within the charge", () => {
    expect(feeCents(34000, { basisPoints: 500, fixedCents: 0, minimumCents: 0 })).toBe(1700);
    expect(feeCents(3333, { basisPoints: 250, fixedCents: 0, minimumCents: 0 })).toBe(83); // 83.325 -> 83
    expect(feeCents(3334, { basisPoints: 250, fixedCents: 30, minimumCents: 0 })).toBe(113); // 83.35 -> 83, +30
    expect(feeCents(500, { basisPoints: 100, fixedCents: 0, minimumCents: 100 })).toBe(100);
    expect(feeCents(50, { basisPoints: 100, fixedCents: 0, minimumCents: 100 })).toBe(50);
    expect(() => feeCents(0, { basisPoints: 100, fixedCents: 0, minimumCents: 0 })).toThrow("LEDGER_BAD_AMOUNT");
  });

  it("refuses a bad business id, bank name, amount or fee", () => {
    expect(() => businessPayable(0)).toThrow();
    expect(() => bankAccount("Royal Bank!")).toThrow();
    expect(() => chargeLines({ organizationId: 1, grossCents: 100, feeCents: 101 })).toThrow("LEDGER_BAD_FEE");
    expect(() => chargeLines({ organizationId: 1, grossCents: -5, feeCents: 0 })).toThrow("LEDGER_BAD_AMOUNT");
  });
});

describe("the PAYMENTS_LEDGER flag", () => {
  it("is on only for the word on", () => {
    expect(paymentsLedgerEnabled({ PAYMENTS_LEDGER: "on" })).toBe(true);
    expect(paymentsLedgerEnabled({ PAYMENTS_LEDGER: " ON " })).toBe(true);
    expect(paymentsLedgerEnabled({ PAYMENTS_LEDGER: "true" })).toBe(false);
    expect(paymentsLedgerEnabled({})).toBe(false);
  });
});
