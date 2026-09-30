// Futprep private sessions and parties (brief 06 v2, Part B). Pure: the
// service list, the weekly-slot dates a coach generates, the PS- code.
import { nextWeekdayOnOrAfter, WEEKDAYS } from "./scheduling";

export type PrivateServiceSlug = "private-1on1" | "private-pair" | "private-pack-4" | "birthday-party";

// How each priced service books: which request type it files as and how
// long a session lasts. Prices live in the offerings table.
export const PRIVATE_SERVICES: Record<PrivateServiceSlug, { requestType: "private_lesson" | "birthday"; durationMinutes: 45 | 90; kind: "session" | "party" }> = {
  "private-1on1": { requestType: "private_lesson", durationMinutes: 45, kind: "session" },
  "private-pair": { requestType: "private_lesson", durationMinutes: 45, kind: "session" },
  "private-pack-4": { requestType: "private_lesson", durationMinutes: 45, kind: "session" },
  "birthday-party": { requestType: "birthday", durationMinutes: 90, kind: "party" },
};

export function isPrivateServiceSlug(value: unknown): value is PrivateServiceSlug {
  return typeof value === "string" && value in PRIVATE_SERVICES;
}

// "Every Wednesday at 4 pm for 6 weeks, starting this week": the dates.
export function weeklySlotDates(input: { fromDate: string; dayOfWeek: string; weeks: number }): string[] {
  if (!WEEKDAYS.includes(input.dayOfWeek)) return [];
  const weeks = Math.max(1, Math.min(26, Math.floor(input.weeks)));
  const cursor = nextWeekdayOnOrAfter(input.fromDate, input.dayOfWeek);
  const dates: string[] = [];
  for (let i = 0; i < weeks; i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

// "PS-2026-7K3QD9A": the reference a parent quotes on a transfer.
export function privateSessionCode(now: Date = new Date(), random: string = crypto.randomUUID()): string {
  return `PS-${now.getUTCFullYear()}-${random.replaceAll("-", "").slice(0, 7).toUpperCase()}`;
}

// Payment status from what has been received against the price.
export function privatePaymentStatus(priceCents: number | null, paidCents: number): "unpaid" | "partial" | "paid" {
  if (paidCents <= 0) return "unpaid";
  if (priceCents === null || paidCents >= priceCents) return "paid";
  return "partial";
}
