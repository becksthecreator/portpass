import { listSections } from "@/db/categories";
import { SECTIONS } from "@/lib/sections";

export type NavLink = { label: string; href: string };
export type SectionTile = { slug: string; name: string; href: string; line: string };
export type SectionOption = { slug: string; name: string };

// The header, footer, homepage grid, /business and the public forms all
// read sections from the categories table, so adding or hiding one in the
// admin needs no deploy. The one-line description is marketing copy that
// lives in the compiled list only. Falls back to that list when there is
// no database to ask -- CI's build has no Supabase credentials, and a
// transient hiccup should never blank the nav.
export async function getSectionTiles(): Promise<SectionTile[]> {
  const lineFor = (slug: string) => SECTIONS.find((s) => s.slug === slug)?.line ?? "";
  try {
    const sections = await listSections();
    if (sections.length) return sections.map((s) => ({ slug: s.slug, name: s.name, href: `/${s.slug}`, line: lineFor(s.slug) }));
  } catch {
    // fall through
  }
  return SECTIONS.map((s) => ({ slug: s.slug, name: s.name, href: s.href, line: s.line }));
}

export async function getNavSections(): Promise<NavLink[]> {
  return (await getSectionTiles()).map((s) => ({ label: s.name, href: s.href }));
}

export async function getSectionOptions(): Promise<SectionOption[]> {
  return (await getSectionTiles()).map((s) => ({ slug: s.slug, name: s.name }));
}
