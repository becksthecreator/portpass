import { cleanEnvValue } from "./email";

// PortPass Payments (design note engineering-payments-ledger-design.md):
// everything in it is behind PAYMENTS_LEDGER, which is off in production
// until the licensing route is settled and the founders switch it on. Off,
// no ledger table is read or written (db/ledger.ts refuses), and no payments
// screen or route answers. On is the exact word "on"; anything else is off.
export function paymentsLedgerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return cleanEnvValue(env.PAYMENTS_LEDGER)?.toLowerCase() === "on";
}

export function assertPaymentsLedger(env: Record<string, string | undefined> = process.env): void {
  if (!paymentsLedgerEnabled(env)) throw new Error("PAYMENTS_LEDGER_OFF");
}
