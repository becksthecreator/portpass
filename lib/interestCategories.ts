// Shared by the client-side InterestForm and the server route/db layer, so
// it must stay free of server-only imports. The database check constraint
// on interest_submissions.category mirrors this list exactly (see
// supabase/migrations/202609281001_sections_round5.sql) -- add to both
// together.
export const INTEREST_CATEGORIES = [
  "venues",
  "events",
  "entertainment",
  "djs",
  "sound-equipment",
  "party-rentals",
  "photo-booths",
  "sports-fitness",
  "weddings",
  "tours",
  "services",
  "photography",
  "phone-tech-repair",
  "shop",
  "apparel-merch",
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];

export function isInterestCategory(value: string): value is InterestCategory {
  return (INTEREST_CATEGORIES as readonly string[]).includes(value);
}
