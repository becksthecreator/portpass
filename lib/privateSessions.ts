// Futprep private sessions and parties (brief 06 v2, Part B). Pure: the
// service list, the weekly-slot dates a coach generates, the PS- code.
import { nextWeekdayOnOrAfter, WEEKDAYS } from "./scheduling";

export type PrivateServiceSlug = "private-1on1" | "private-pair" | "private-trio" | "private-group" | "private-pack-4" | "birthday-party";

// How each priced service books: which request type it files as, how long
// a session lasts and how many children it is for (brief 13: the tiers are
// priced per child). Prices live in the offerings table.
export const PRIVATE_SERVICES: Record<PrivateServiceSlug, { requestType: "private_lesson" | "birthday"; durationMinutes: 45 | 90; kind: "session" | "party"; children: { min: number; max: number } }> = {
  "private-1on1": { requestType: "private_lesson", durationMinutes: 45, kind: "session", children: { min: 1, max: 1 } },
  "private-pair": { requestType: "private_lesson", durationMinutes: 45, kind: "session", children: { min: 2, max: 2 } },
  "private-trio": { requestType: "private_lesson", durationMinutes: 45, kind: "session", children: { min: 3, max: 3 } },
  "private-group": { requestType: "private_lesson", durationMinutes: 45, kind: "session", children: { min: 4, max: 8 } },
  "private-pack-4": { requestType: "private_lesson", durationMinutes: 45, kind: "session", children: { min: 1, max: 1 } },
  "birthday-party": { requestType: "birthday", durationMinutes: 90, kind: "party", children: { min: 1, max: 1 } },
};

// A price per child (the group session) is multiplied by the children;
// any other price is for the session. $120 for 2 children is $60 each.
export function perChildCents(slug: PrivateServiceSlug, priceCents: number | null, priceUnit: string | null): number | null {
  if (priceCents === null) return null;
  if (priceUnit === "per_child") return priceCents;
  const { min, max } = PRIVATE_SERVICES[slug].children;
  return min === max ? Math.round(priceCents / min) : null;
}

export function sessionTotalCents(priceCents: number | null, priceUnit: string | null, children: number): number | null {
  if (priceCents === null) return null;
  return priceUnit === "per_child" ? priceCents * children : priceCents;
}

export function childrenAllowed(slug: PrivateServiceSlug, children: number): boolean {
  const { min, max } = PRIVATE_SERVICES[slug].children;
  return Number.isInteger(children) && children >= min && children <= max;
}

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
