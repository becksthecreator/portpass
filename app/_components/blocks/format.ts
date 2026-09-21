import type { OfferingType } from "@/db/organizations";

// Prices across this codebase are stored in cents with a currency code that
// is always effectively USD-pegged (BSD). Intl's currency formatter doesn't
// carry a "$" glyph for every currency code in every runtime -- it can fall
// back to printing the ISO code ("BSD 500") -- so the symbol is fixed
// rather than derived from a currency code. See the wedding package price
// fix earlier in this project for the bug this avoids repeating.
export function formatPriceCents(cents: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(cents / 100)}`;
}

const PRICE_UNIT_SUFFIX: Record<string, string> = {
  per_session: "/session",
  per_term: "/term",
  per_hour: "/hr",
  per_day: "/day",
  per_person: "/person",
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
