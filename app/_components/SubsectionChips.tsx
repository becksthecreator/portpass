import { getSectionWithSubcategories, type Section } from "@/db/categories";
import { liveCountsByCategory } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { SubsectionPicker, type SubsectionChip } from "./SubsectionPicker";

// Server half of the subsection picker: reads the section's subsections
// from the categories table (the one source the nav, the sitemap and the
// section pages all share) and the live counts, and hands the client half
// a plain list. Fail-soft: with no section or a database hiccup it renders
// nothing rather than breaking the page.
export async function SubsectionChips({ section, sectionSlug, current, counts }: { section?: Section; sectionSlug?: string; current: string | null; counts?: Map<string, number> }) {
  let resolved: Section | null = section ?? null;
  if (!resolved && sectionSlug) resolved = await getSectionWithSubcategories(sectionSlug).catch(() => null);
  if (!resolved) return null;
  const visible = resolved.subcategories.filter((c) => c.isVisible);
  if (!visible.length) return null;

  let live = counts;
  if (!live) {
    try {
      live = await withOneRetry(() => liveCountsByCategory());
    } catch {
      live = new Map();
    }
  }
  const items: SubsectionChip[] = [
    { slug: null, name: "All", href: `/${resolved.slug}`, live: live.get(resolved.slug) ?? 0 },
    ...visible.map((c) => ({ slug: c.slug, name: c.name, href: `/${resolved.slug}/${c.slug}`, live: live.get(c.slug) ?? 0 })),
  ];
  return <SubsectionPicker label={`Browse ${resolved.name} by type`} items={items} current={current} />;
}
