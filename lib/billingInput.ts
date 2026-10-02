import { BILLING_CYCLES, isDay, RECEIPT_METHODS, type BillingCycle, type ReceiptMethod } from "./billing";
import type { AccountInput } from "@/db/billing";
import { normalizePhoneE164 } from "./phone";

// What Admin -> Billing's forms send, checked before anything is saved.
// Money arrives as whole cents; dates as YYYY-MM-DD.

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const clip = (value: unknown, max: number): string | null => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return text || null;
};
const cents = (value: unknown, max = 100_000_000): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null);
const dayOrNull = (value: unknown): string | null | undefined => (value === null || value === undefined || value === "" ? null : isDay(value) ? value : undefined);

export function cleanAccount(input: unknown): Checked<AccountInput> {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const raw = input as Record<string, unknown>;
  const cycle = BILLING_CYCLES.find((c) => c === raw.cycle) as BillingCycle | undefined;
  if (!cycle) return { ok: false, error: "Choose how the business pays." };
  const priceCents = cents(raw.priceCents);
  const retainerCents = cents(raw.retainerCents ?? 0);
  const extraLocationCents = cents(raw.extraLocationCents ?? 2500);
  const setupFeeCents = cents(raw.setupFeeCents ?? 0);
  if (priceCents === null || retainerCents === null || extraLocationCents === null || setupFeeCents === null) return { ok: false, error: "Amounts are in dollars and can't be negative." };
  const whole = (value: unknown, min: number, max: number, fallback: number): number | null => (value === undefined || value === null || value === "" ? fallback : typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null);
  const annualMonthsCharged = whole(raw.annualMonthsCharged, 1, 12, 10);
  const extraLocations = whole(raw.extraLocations, 0, 200, 0);
  const commissionBps = whole(raw.commissionBps, 0, 10000, 0);
  const freeMonthsCredit = whole(raw.freeMonthsCredit, 0, 36, 0);
  if (annualMonthsCharged === null || extraLocations === null || commissionBps === null || freeMonthsCredit === null) return { ok: false, error: "One of the numbers isn't valid." };
  const goLiveOn = dayOrNull(raw.goLiveOn);
  const freeUntilOverride = dayOrNull(raw.freeUntilOverride);
  const agreementSignedOn = dayOrNull(raw.agreementSignedOn);
  if (goLiveOn === undefined || freeUntilOverride === undefined || agreementSignedOn === undefined) return { ok: false, error: "One of the dates isn't a real date." };
  const setupStatus = (["due", "paid", "waived"] as const).find((s) => s === raw.setupStatus) ?? "waived";
  const email = clip(raw.billingEmail, 254)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "The billing email doesn't look right." };
  const typedPhone = clip(raw.billingWhatsappE164, 30);
  const phone = typedPhone ? normalizePhoneE164(typedPhone) : null;
  if (typedPhone && !phone) return { ok: false, error: "The WhatsApp number doesn't look right." };
  const creditReason = clip(raw.creditReason, 200);
  const freeUntilOverrideReason = clip(raw.freeUntilOverrideReason, 200);
  const statusReason = clip(raw.statusReason, 300);
  const paused = raw.paused === true;
  const ended = raw.ended === true;
  if (freeMonthsCredit > 0 && !creditReason) return { ok: false, error: "Say why the free months were given." };
  if (freeUntilOverride && !freeUntilOverrideReason) return { ok: false, error: "Say why the free period has its own end date." };
  if ((paused || ended) && !statusReason) return { ok: false, error: "Say why the account is paused or ended. It is logged." };
  if ((cycle === "monthly" || cycle === "annual") && priceCents === 0 && retainerCents === 0) return { ok: false, error: "A monthly or annual plan needs its price." };
  return {
    ok: true,
    value: {
      planCode: clip(raw.planCode, 40), cycle, priceCents, annualMonthsCharged, retainerCents, extraLocations, extraLocationCents, commissionBps, goLiveOn, freeMonthsCredit, creditReason,
      freeUntilOverride, freeUntilOverrideReason, setupFeeCents, setupStatus, agreementSignedOn, agreementVersion: clip(raw.agreementVersion, 40), billingEmail: email, billingWhatsappE164: phone,
      paused, ended, statusReason, notes: clip(raw.notes, 1000),
    },
  };
}

export function cleanReceipt(input: unknown): Checked<{ amountCents: number; method: ReceiptMethod; reference: string | null; receivedOn: string; note: string | null }> {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const raw = input as Record<string, unknown>;
  const amountCents = cents(raw.amountCents);
  if (!amountCents) return { ok: false, error: "Enter the amount received." };
  const method = RECEIPT_METHODS.find((m) => m === raw.method);
  if (!method) return { ok: false, error: "Choose how it was paid." };
  if (!isDay(raw.receivedOn)) return { ok: false, error: "Enter the date it was received." };
  return { ok: true, value: { amountCents, method, reference: clip(raw.reference, 80), receivedOn: raw.receivedOn, note: clip(raw.note, 300) } };
}
