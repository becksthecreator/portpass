// The compiled mirror of the categories table: six sections and their
// subsections as set for round 5 (27 Sept). At runtime the table is the
// source of truth (db/categories.ts; the admin edits it, no deploy needed).
// This list exists for the moments there is no database to ask -- CI's
// build, a Supabase hiccup -- and for client components that render a
// section list without a round trip. It carries no server imports.
// db/categories.integration.test.ts fails CI if it drifts from the seed.
export const SECTIONS = [
  {
    slug: "sports-fitness",
    name: "Sports & Fitness",
    line: "Classes, camps and Saturday sessions parents register for online.",
    href: "/sports-fitness",
    subsections: [
      { slug: "football-soccer", name: "Football / Soccer" },
      { slug: "basketball", name: "Basketball" },
      { slug: "swimming", name: "Swimming" },
      { slug: "tennis", name: "Tennis" },
      { slug: "golf", name: "Golf" },
      { slug: "sailing", name: "Sailing" },
      { slug: "strength-conditioning", name: "Strength & Conditioning" },
      { slug: "boxing-martial-arts", name: "Boxing & Martial Arts" },
      { slug: "studios", name: "Studios (yoga, pilates, spin)" },
    ],
  },
  {
    slug: "weddings",
    name: "Weddings",
    line: "Ceremonies and vow renewals, planned end to end with the Wedding Desk.",
    href: "/weddings",
    subsections: [
      { slug: "planning", name: "Planning" },
      { slug: "officiants", name: "Officiants" },
      { slug: "wedding-venues", name: "Venues" },
      { slug: "flowers-decor", name: "Flowers & Decor" },
      { slug: "photo-video", name: "Photo & Video" },
      { slug: "cakes", name: "Cakes" },
      { slug: "hair-makeup", name: "Hair & Makeup" },
    ],
  },
  {
    slug: "venues",
    name: "Venues",
    line: "Beaches, halls and studios, held by the hour or the day.",
    href: "/venues",
    subsections: [
      { slug: "event-venues", name: "Event Venues" },
      { slug: "gardens-outdoor", name: "Gardens & Outdoor" },
      { slug: "meeting-rooms", name: "Meeting Rooms" },
    ],
  },
  {
    slug: "tours",
    name: "Tours",
    line: "Boats, fishing charters, bikes, jeeps and food tours.",
    href: "/tours",
    subsections: [
      { slug: "boats", name: "Boats & Charters" },
      { slug: "fishing-charters", name: "Fishing" },
      { slug: "food-tours", name: "Food & Culture" },
      { slug: "land-tours", name: "Land Tours (bikes, jeeps)" },
    ],
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    line: "Events, DJs and sound equipment for the night.",
    href: "/entertainment",
    subsections: [
      { slug: "events", name: "Events" },
      { slug: "djs", name: "DJs" },
      { slug: "sound-equipment", name: "Sound Equipment" },
      { slug: "party-rentals", name: "Party Rentals" },
      { slug: "photo-booths", name: "Photo Booths" },
    ],
  },
  {
    slug: "services",
    name: "Services",
    line: "Photographers, videographers and phone repair you can book.",
    href: "/services",
    subsections: [
      { slug: "photography", name: "Photo & Video" },
      { slug: "phone-tech-repair", name: "Phone & Tech Repair" },
    ],
  },
  {
    slug: "shop",
    name: "Shop Bahamian",
    line: "Drops and pre-orders from Bahamian brands. Reserve your size, pay the brand.",
    href: "/shop",
    subsections: [{ slug: "apparel-merch", name: "Apparel & Merch" }],
  },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];

export function isSectionSlug(value: string): value is SectionSlug {
  return SECTIONS.some((section) => section.slug === value);
}

export function sectionName(slug: string | null): string | null {
  return SECTIONS.find((section) => section.slug === slug)?.name ?? null;
}
