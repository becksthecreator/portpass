// PortPass Market's product categories (brief 25): the chips on /market's
// "Things to buy" tab and the category a seller picks for each product.
// The database checks the same slugs (public.market_category_valid in
// 202610200001_market_sellers.sql) -- change both together. Pure, so the
// pages, the forms and the unit tests read one list.

export type MarketCategorySlug = "food-drink" | "kits-apparel" | "crafts-gifts" | "home" | "beauty" | "kids" | "events-party" | "services";

export type MarketCategory = { slug: MarketCategorySlug; name: string };

export const MARKET_CATEGORIES: readonly MarketCategory[] = [
  { slug: "food-drink", name: "Food & Drink" },
  { slug: "kits-apparel", name: "Kits & Apparel" },
  { slug: "crafts-gifts", name: "Crafts & Gifts" },
  { slug: "home", name: "Home" },
  { slug: "beauty", name: "Beauty" },
  { slug: "kids", name: "Kids" },
  { slug: "events-party", name: "Events & Party" },
  { slug: "services", name: "Services" },
];

export function isMarketCategory(value: unknown): value is MarketCategorySlug {
  return typeof value === "string" && MARKET_CATEGORIES.some((c) => c.slug === value);
}

export function marketCategoryName(slug: string | null | undefined): string | null {
  return MARKET_CATEGORIES.find((c) => c.slug === slug)?.name ?? null;
}
