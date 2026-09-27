import { listSections } from "@/db/categories";
import { SECTIONS } from "@/lib/sections";

export type NavLink = { label: string; href: string };

// The header, footer and 404 page read sections from the categories table,
// so adding or hiding one in the admin needs no deploy. Falls back to the
// compiled list when there is no database to ask -- CI's build has no
// Supabase credentials, and a transient hiccup should never blank the nav.
export async function getNavSections(): Promise<NavLink[]> {
  try {
    const sections = await listSections();
    if (sections.length) return sections.map((s) => ({ label: s.name, href: `/${s.slug}` }));
  } catch {
    // fall through
  }
  return SECTIONS.map((s) => ({ label: s.name, href: s.href ?? `/${s.slug}` }));
}
