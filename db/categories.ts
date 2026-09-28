import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { isSectionSlug } from "@/lib/sections";

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

// ---- admin writes (the Sections screen) ----------------------------------

const CATEGORY_COLUMNS = "id,slug,name,parent_id,template,sort_order,is_visible,coming_soon_threshold";

export async function createCategory(input: { slug: string; name: string; parentId: number | null; template: Category["template"] }): Promise<Category> {
  const supabase = getSupabaseAdmin();
  const siblings = (await listCategories()).filter((c) => c.parentId === input.parentId);
  const sortOrder = siblings.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;
  const { data, error } = await supabase
    .from("categories")
    .insert({ slug: input.slug, name: input.name, parent_id: input.parentId, template: input.template, sort_order: sortOrder })
    .select(CATEGORY_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not create category");
  invalidateCategoryCache();
  return toCategory(data!);
}

export type CategoryPatch = Partial<{ name: string; isVisible: boolean; comingSoonThreshold: number; sortOrder: number }>;

export async function updateCategory(id: number, patch: CategoryPatch): Promise<Category> {
  const supabase = getSupabaseAdmin();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.isVisible !== undefined) row.is_visible = patch.isVisible;
  if (patch.comingSoonThreshold !== undefined) row.coming_soon_threshold = patch.comingSoonThreshold;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { data, error } = await supabase.from("categories").update(row).eq("id", id).select(CATEGORY_COLUMNS).single();
  throwIfSupabaseError(error, "Could not update category");
  invalidateCategoryCache();
  return toCategory(data!);
}

// Swaps sort_order with the neighbour above or below, within the same
// parent. Returns false when there is nothing to swap with.
export async function moveCategory(id: number, direction: "up" | "down"): Promise<boolean> {
  invalidateCategoryCache();
  const all = await listCategories();
  const target = all.find((c) => c.id === id);
  if (!target) return false;
  const siblings = all.filter((c) => c.parentId === target.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const index = siblings.findIndex((c) => c.id === id);
  const other = siblings[direction === "up" ? index - 1 : index + 1];
  if (!other) return false;
  // Distinct orders even when two rows shared one: renumber the pair.
  const [low, high] = direction === "up" ? [other, target] : [target, other];
  const base = Math.min(low.sortOrder, high.sortOrder);
  await updateCategory(high.id, { sortOrder: base });
  await updateCategory(low.id, { sortOrder: base + 1 });
  return true;
}

// Section validation for the public forms (/apply, sign-up, the wizard):
// the table when it answers, the compiled mirror when it doesn't, so a
// section added in the admin is accepted at once and a database hiccup
// never rejects a real submission.
export async function isKnownSectionSlug(slug: string): Promise<boolean> {
  try {
    const sections = await listSections();
    if (sections.length) return sections.some((s) => s.slug === slug);
  } catch {
    // fall through to the compiled list
  }
  return isSectionSlug(slug);
}
