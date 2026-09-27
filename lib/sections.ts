// The five top-level sections, as decided for the OWN Conference build
// (27 Sept): Events is a subsection of Entertainment, not a section, and
// Tours is new. Free of server imports so client forms can use it. The
// accounts brief moves this into a `categories` table later; until then
// this is the one list /business, /apply and the nav copy agree on.
export const SECTIONS = [
  { slug: "sports-fitness", name: "Sports & Fitness", line: "Classes, camps and Saturday sessions parents register and pay for online.", href: "/sports-fitness" },
  { slug: "weddings", name: "Weddings", line: "Ceremonies and vow renewals, planned end to end with the Wedding Desk.", href: "/weddings" },
  { slug: "venues", name: "Venues", line: "Beaches, halls and studios, held by the hour or the day.", href: "/venues" },
  { slug: "tours", name: "Tours", line: "Boats, fishing charters, bikes, jeeps and food tours.", href: "/tours" },
  { slug: "entertainment", name: "Entertainment", line: "Events, DJs and sound equipment for the night.", href: "/entertainment" },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];

export function isSectionSlug(value: string): value is SectionSlug {
  return SECTIONS.some((section) => section.slug === value);
}

export function sectionName(slug: string | null): string | null {
  return SECTIONS.find((section) => section.slug === slug)?.name ?? null;
}
