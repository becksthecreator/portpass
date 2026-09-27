import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type Category = {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
  template: "organization" | "program" | "service" | "event" | "venue" | null;
  sortOrder: number;
  isVisible: boolean;
  comingSoonThreshold: number;
};

export type Section = Category & { subcategories: Category[] };

const CACHE_TTL_MS = 60_000;
let cache: { rows: Category[]; fetchedAt: number } | null = null;

function toCategory(row: Record<string, unknown>): Category {
  return {
    id: Number(row.id),
    slug: row.slug as string,
    name: row.name as string,
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    template: (row.template as Category["template"]) ?? null,
    sortOrder: Number(row.sort_order),
    isVisible: Boolean(row.is_visible),
    comingSoonThreshold: Number(row.coming_soon_threshold),
  };
}

// The whole table is small (five sections, a few dozen subcategories) and
// read on every page for the nav, so it's fetched once per minute per
// server instance rather than per request. Admin writes call
// invalidateCategoryCache() so their own instance sees the change at once.
export async function listCategories(): Promise<Category[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("categories")
    .select("id,slug,name,parent_id,template,sort_order,is_visible,coming_soon_threshold")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load categories");
  const rows = (data ?? []).map(toCategory);
  cache = { rows, fetchedAt: Date.now() };
  return rows;
}

export function invalidateCategoryCache() {
  cache = null;
}

export async function listSections(options: { includeHidden?: boolean } = {}): Promise<Section[]> {
  const all = await listCategories();
  return all
    .filter((c) => c.parentId === null && (options.includeHidden || c.isVisible))
    .map((section) => ({
      ...section,
      subcategories: all.filter((c) => c.parentId === section.id && (options.includeHidden || c.isVisible)),
    }));
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const all = await listCategories();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function getSectionWithSubcategories(slug: string): Promise<Section | null> {
  const sections = await listSections({ includeHidden: true });
  return sections.find((s) => s.slug === slug) ?? null;
}
