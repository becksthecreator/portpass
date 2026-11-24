// PortPass Payments, the ledger's rules (design note
// engineering-payments-ledger-design.md, section 2). Double-entry: every
// transaction is two or more lines summing to zero, debit +, credit -.
// Integer cents, BSD. The database enforces the same (migration
// 202610280011); these helpers build correct lines and say why a set is
// wrong before anything is sent.

export type LedgerAccountKey =
  | "customer_clearing"
  | "portpass_fees"
  | "payouts_in_transit"
  | "refunds_payable"
  | `bank:${string}`
  | `business_payable:${number}`;

export type LedgerLine = { account: LedgerAccountKey; amount_cents: number };

export const businessPayable = (organizationId: number): LedgerAccountKey => {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error("LEDGER_BAD_ORGANIZATION");
  return `business_payable:${organizationId}`;
};

export const bankAccount = (name: string): LedgerAccountKey => {
  if (!/^[a-z0-9_-]{1,40}$/.test(name)) throw new Error("LEDGER_BAD_BANK_NAME");
  return `bank:${name}`;
};

const KEY = /^(customer_clearing|portpass_fees|payouts_in_transit|refunds_payable|bank:[a-z0-9_-]{1,40}|business_payable:[1-9][0-9]{0,17})$/;

// Why a set of lines can't be posted, or null when it can.
export function ledgerProblem(lines: readonly LedgerLine[]): string | null {
  if (lines.length < 2) return "A transaction needs at least two lines.";
  for (const line of lines) {
    if (!KEY.test(line.account)) return `Unknown account "${line.account}".`;
    if (!Number.isSafeInteger(line.amount_cents) || line.amount_cents === 0) return "Every line needs a whole, non-zero number of cents.";
  }
  const sum = lines.reduce((total, line) => total + line.amount_cents, 0);
  if (sum !== 0) return `The lines don't balance (they sum to ${sum} cents).`;
  return null;
}

// A business's fee plan (design note, section 3): basis points plus a fixed
// amount, with a minimum. Bex sets the numbers; none are hard-coded here.
export type FeePlan = { basisPoints: number; fixedCents: number; minimumCents: number };

// PortPass's fee on one charge, rounded half up to the cent, never more
// than the charge itself and never negative.
export function feeCents(grossCents: number, plan: FeePlan): number {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error("LEDGER_BAD_AMOUNT");
  const percentage = Math.floor((grossCents * plan.basisPoints + 5000) / 10000);
  const fee = Math.max(plan.minimumCents, percentage + plan.fixedCents);
  return Math.min(grossCents, Math.max(0, fee));
}

// A customer's payment that succeeded: the money is in clearing, the
// business is owed the net, PortPass earns the fee.
export function chargeLines(input: { organizationId: number; grossCents: number; feeCents: number }): LedgerLine[] {
  const { grossCents, feeCents: fee } = input;
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error("LEDGER_BAD_AMOUNT");
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > grossCents) throw new Error("LEDGER_BAD_FEE");
  const lines: LedgerLine[] = [
    { account: "customer_clearing", amount_cents: -grossCents },
    { account: businessPayable(input.organizationId), amount_cents: grossCents - fee },
  ];
  if (fee > 0) lines.push({ account: "portpass_fees", amount_cents: fee });
  // A fee of the whole charge leaves the business nothing: drop the zero line.
  return lines.filter((line) => line.amount_cents !== 0);
}

// The lines that undo a posted transaction exactly.
export function reversalLines(lines: readonly LedgerLine[]): LedgerLine[] {
  return lines.map((line) => ({ account: line.account, amount_cents: -line.amount_cents }));
}
