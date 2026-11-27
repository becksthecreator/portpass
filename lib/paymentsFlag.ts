import { cleanEnvValue } from "./email";

// PortPass Payments (design note engineering-payments-ledger-design.md):
// everything in it is behind PAYMENTS_LEDGER. On is the exact word "on".
//
// Until go-live it can be on only on the local stack: Vercel's previews
// share the live database, so a preview with the flag on would put sandbox
// money into live tables (Security & QA, G2). With VERCEL_ENV set to
// "preview" or "production" the flag is off whatever it says. Going live
// changes this deliberately, in its own reviewed PR.
const ALLOWED_VERCEL_ENVS = new Set(["", "development"]);

// Read by name, so lib/env.test.ts sees which settings the server uses.
const fromProcess = () => ({ PAYMENTS_LEDGER: process.env.PAYMENTS_LEDGER, VERCEL_ENV: process.env.VERCEL_ENV });

export function paymentsLedgerEnabled(env: Record<string, string | undefined> = fromProcess()): boolean {
  if (cleanEnvValue(env.PAYMENTS_LEDGER)?.toLowerCase() !== "on") return false;
  return ALLOWED_VERCEL_ENVS.has((cleanEnvValue(env.VERCEL_ENV) ?? "").toLowerCase());
}

export function assertPaymentsLedger(env: Record<string, string | undefined> = fromProcess()): void {
  if (!paymentsLedgerEnabled(env)) throw new Error("PAYMENTS_LEDGER_OFF");
}
