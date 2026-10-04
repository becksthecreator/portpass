import type { OfferingType } from "@/db/organizations";

// Prices across this codebase are stored in cents. The Bahamian dollar is
// pegged one-to-one to the US dollar and both circulate. A price reads
// "$35 per session" and nothing more (brief 18, A6); the currency is said
// once, in the footer of every page (PRICE_CURRENCY_LINE). Intl's currency
// formatter doesn't carry a "$" glyph for every currency code in every
// runtime (it can print "BSD 500"), so the symbol is fixed text rather
// than derived from a currency code.
export const PRICE_CURRENCY_LINE = "Prices in Bahamian dollars (BSD), equal to US dollars.";

// `options` is kept for the callers that used to ask for the note to be
// left off; no price carries one now.
export function formatPriceCents(cents: number, options: { currency?: boolean } = {}): string {
  void options;
  const whole = cents % 100 === 0;
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
}

const PRICE_UNIT_SUFFIX: Record<string, string> = {
  per_session: " per session",
  per_term: " per term",
  per_hour: " per hour",
  per_day: " per day",
  per_person: " per person",
  per_child: " per child",
};

export function formatPrice(cents: number, unit: string | null): string {
  const amount = formatPriceCents(cents);
  if (unit === "from") return `From ${amount}`;
  const suffix = unit ? PRICE_UNIT_SUFFIX[unit] : undefined;
  return suffix ? `${amount}${suffix}` : amount;
}

// label (offerings.age_label, brief 12) wins: whole-year columns can't
// say "1½–3".
export function formatAgeRange(min: number | null, max: number | null, label?: string | null): string | null {
  if (label) return `Ages ${label}`;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `Ages ${min}-${max}`;
  if (min !== null) return `Ages ${min}+`;
  return `Up to age ${max}`;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const OFFERING_ACTION_LABEL: Record<OfferingType, string> = {
  program: "Register",
  event: "Get tickets",
  venue: "Book",
  service: "Request",
};
