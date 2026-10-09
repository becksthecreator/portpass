// Futprep private sessions and parties (brief 06 v2, Part B; Brief 29, part
// B). Pure: what a service row means, the weekly-slot dates a coach
// generates, the reference, the button copy.
import { nextWeekdayOnOrAfter, WEEKDAYS } from "./scheduling";

// A priced service a parent can book: an offerings row of type "service".
// Its length and how many children it is for come from the row (Brief 29,
// part B); the slug map below is only the fallback for a row made before
// those columns existed.
export type PrivateService = {
  slug: string;
  name: string;
  summary: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  inclusions: string[];
  isPublished: boolean;
  requestType: "private_lesson" | "birthday";
  durationMinutes: number;
  kind: "session" | "party";
  minChildren: number;
  maxChildren: number;
  // $120 for a pair is $60 each; a group is $35 each; null when it is not a
  // per-child price.
  perChildCents: number | null;
};

export type ServiceRow = {
  slug: string;
  name: string;
  summary?: string | null;
  price_cents: number | null;
  price_unit: string | null;
  inclusions?: string[] | null;
  is_published: boolean;
  duration_minutes?: number | null;
  min_children?: number | null;
  max_children?: number | null;
};

// The lengths and child counts the first Futprep services had before the
// columns existed. A row that has the columns never reaches this.
const LEGACY: Record<string, { durationMinutes: number; children: { min: number; max: number } }> = {
  "private-1on1": { durationMinutes: 45, children: { min: 1, max: 1 } },
  "private-pair": { durationMinutes: 45, children: { min: 2, max: 2 } },
  "private-trio": { durationMinutes: 45, children: { min: 3, max: 3 } },
  "private-group": { durationMinutes: 45, children: { min: 4, max: 8 } },
  "private-pack-4": { durationMinutes: 45, children: { min: 1, max: 1 } },
  "birthday-party": { durationMinutes: 90, children: { min: 1, max: 1 } },
};
export const DEFAULT_DURATION_MINUTES = 45;

// A party books as a birthday request; everything else as a lesson.
export function serviceKind(slug: string, name: string): "session" | "party" {
  return slug.startsWith("birthday") || /\bparty\b/i.test(name) ? "party" : "session";
}

// A price per child (the group session) is the per-child figure as it is;
// any other price is for the session, shared by its fixed number of children.
export function perChildCents(priceCents: number | null, priceUnit: string | null, minChildren: number, maxChildren: number): number | null {
  if (priceCents === null) return null;
  if (priceUnit === "per_child") return priceCents;
  return minChildren === maxChildren ? Math.round(priceCents / minChildren) : null;
}

export function sessionTotalCents(priceCents: number | null, priceUnit: string | null, children: number): number | null {
  if (priceCents === null) return null;
  return priceUnit === "per_child" ? priceCents * children : priceCents;
}

export function childrenAllowed(service: { minChildren: number; maxChildren: number }, children: number): boolean {
  return Number.isInteger(children) && children >= service.minChildren && children <= service.maxChildren;
}

export function serviceFromRow(row: ServiceRow): PrivateService {
  const legacy = LEGACY[row.slug];
  const kind = serviceKind(row.slug, row.name);
  const minChildren = row.min_children ?? legacy?.children.min ?? 1;
  const maxChildren = Math.max(minChildren, row.max_children ?? legacy?.children.max ?? minChildren);
  const priceCents = row.price_cents === null || row.price_cents === undefined ? null : Number(row.price_cents);
  return {
    slug: row.slug,
    name: row.name,
    summary: row.summary ?? null,
    priceCents,
    priceUnit: row.price_unit ?? null,
    inclusions: row.inclusions ?? [],
    isPublished: Boolean(row.is_published),
    requestType: kind === "party" ? "birthday" : "private_lesson",
    durationMinutes: row.duration_minutes ?? legacy?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    kind,
    minChildren,
    maxChildren,
    perChildCents: perChildCents(priceCents, row.price_unit ?? null, minChildren, maxChildren),
  };
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

// "Book a private session · 30 min $35 · 60 min $70 →", from the published
// sessions, shortest first. With nothing priced: "Book a private session →".
export function sessionButtonLabel(services: readonly PrivateService[]): string {
  const parts = services
    .filter((s) => s.kind === "session" && s.isPublished && s.priceCents !== null)
    .sort((a, b) => a.durationMinutes - b.durationMinutes)
    .map((s) => `${s.durationMinutes} min ${money(s.priceCents!)}`);
  return parts.length ? `Book a private session · ${parts.join(" · ")} →` : "Book a private session →";
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

// "FP-S0007": a request's reference, numbered from the business's payment
// settings like its payment requests (FP-0042) and bookings (FP-B0007).
// The database function private_session_next_reference makes it; this is
// the same shape for tests and for reading one back.
export const SESSION_REFERENCE = /^[A-Z]{2,4}-S[0-9]{4,}$/;
export function sessionReference(prefix: string, n: number): string {
  return `${prefix}-S${n < 10000 ? String(n).padStart(4, "0") : String(n)}`;
}

// "PS-2026-7K3QD9A": the reference a request got before Brief 29; still the
// fallback when a business has no payment settings and none can be made.
export function privateSessionCode(now: Date = new Date(), random: string = crypto.randomUUID()): string {
  return `PS-${now.getUTCFullYear()}-${random.replaceAll("-", "").slice(0, 7).toUpperCase()}`;
}

// Payment status from what has been received against the price.
export function privatePaymentStatus(priceCents: number | null, paidCents: number): "unpaid" | "partial" | "paid" {
  if (paidCents <= 0) return "unpaid";
  if (priceCents === null || paidCents >= priceCents) return "paid";
  return "partial";
}
