// Maps an organizations.primary_category slug (matches a category hub route,
// e.g. "sports-fitness") to the label shown in the Identity block.
const CATEGORY_LABELS: Record<string, string> = {
  "sports-fitness": "Sports & Fitness",
  weddings: "Weddings",
  venues: "Venues",
  events: "Events",
  entertainment: "Entertainment",
};

export function categoryLabel(primaryCategory: string | null): string | null {
  if (!primaryCategory) return null;
  return CATEGORY_LABELS[primaryCategory] ?? primaryCategory;
}
