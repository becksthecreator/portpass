import type { OfferingType } from "@/db/organizations";

// Prices across this codebase are stored in cents. The Bahamian dollar is
// pegged one-to-one to the US dollar and both circulate, so every public
// price reads "$120 BSD (= USD)" (round 5, §7) -- a tourist knows at once
// what they will pay, a local sees the currency they use. Intl's currency
// formatter doesn't carry a "$" glyph for every currency code in every
// runtime (it can print "BSD 500"), so the symbol and the note are fixed
// text rather than derived from a currency code.
export const PRICE_CURRENCY_NOTE = "BSD (= USD)";

export function formatPriceCents(cents: number, options: { currency?: boolean } = {}): string {
  const whole = cents % 100 === 0;
  const amount = `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
  return options.currency === false ? amount : `${amount} ${PRICE_CURRENCY_NOTE}`;
}

const PRICE_UNIT_SUFFIX: Record<string, string> = {
  per_session: " per session",
  per_term: " per term",
  per_hour: " per hour",
  per_day: " per day",
  per_person: " per person",
};

export function formatPrice(cents: number, unit: string | null): string {
  const amount = formatPriceCents(cents);
  if (unit === "from") return `From ${amount}`;
  const suffix = unit ? PRICE_UNIT_SUFFIX[unit] : undefined;
  return suffix ? `${amount}${suffix}` : amount;
}

export function formatAgeRange(min: number | null, max: number | null): string | null {
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
