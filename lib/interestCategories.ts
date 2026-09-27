// Shared by the client-side InterestForm and the server route/db layer, so
// it must stay free of server-only imports. The database check constraint
// on interest_submissions.category mirrors this list exactly (see
// supabase/migrations/202609271001_interest_categories_widen.sql) -- add
// to both together.
export const INTEREST_CATEGORIES = [
  "venues",
  "events",
  "entertainment",
  "djs",
  "sound-equipment",
  "sports-fitness",
  "weddings",
  "tours",
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];

export function isInterestCategory(value: string): value is InterestCategory {
  return (INTEREST_CATEGORIES as readonly string[]).includes(value);
}
