// Slugs that can never be given to a section, subcategory or business,
// because a URL segment with that name already means something else on
// portpassbahamas.com. Checked wherever a slug is created from user or
// admin input (the Sections admin, the owner wizard, concierge onboarding).
// Public routes resolve /{section}/{slug} as subcategory-then-business, so
// a business slug must also not collide with a subcategory in its section
// (checked against the categories table at write time, not here).
export const RESERVED_TOP_LEVEL_SLUGS = new Set<string>([
  "_next",
  "about",
  "account",
  "admin",
  "api",
  "apple-icon",
  "apply",
  "business",
  "contact",
  "entertainment",
  "events",
  "favicon.svg",
  "futprep",
  "icons",
  "login",
  "manifest.webmanifest",
  "opengraph-image",
  "organizations",
  "own",
  "privacy",
  "robots.txt",
  "signup",
  "sitemap.xml",
  "sites",
  "sports-fitness",
  "terms",
  "tours",
  "venues",
  "weddings",
  "where-to",
]);

// Second-level names that already exist as static routes under a section
// (e.g. /weddings/admin), so a business or subcategory can't shadow them.
export const RESERVED_SECOND_LEVEL_SLUGS = new Set<string>(["admin", "staff", "register", "my", "coaches", "notify", "plan", "settings", "preview", "setup"]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isReservedSlug(slug: string, level: "top" | "second"): boolean {
  return level === "top" ? RESERVED_TOP_LEVEL_SLUGS.has(slug) : RESERVED_SECOND_LEVEL_SLUGS.has(slug);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length >= 2 && slug.length <= 60;
}
