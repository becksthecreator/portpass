import type { PaymentFrequency, PaymentStatus } from "@/db/registrations";

// Recorded payments accumulate against a registration; this decides what
// payment_status should become given the total received so far. Pulled out
// of db/staff.ts's recordFutprepPayment() so the money logic can be unit
// tested without a database.
export function derivePaymentStatus(input: {
  paymentFrequency: PaymentFrequency;
  paidCents: number;
  amountDueCents: number;
}): PaymentStatus {
  if (input.paymentFrequency === "weekly") {
    return input.paidCents > 0 ? "paid" : "pending";
  }
  if (input.paidCents >= input.amountDueCents) return "paid";
  if (input.paidCents > 0) return "partial";
  return "pending";
}
