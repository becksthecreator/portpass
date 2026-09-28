import { invalidateCategoryCache, listSections } from "@/db/categories";
import { liveCountsByCategory } from "@/db/organizations";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/AdminShell";
import { SectionsManager, type SectionRow } from "./SectionsManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sections | PortPass admin",
  robots: { index: false, follow: false },
};

// The categories table, editable: what the header, the Browse sheet, the
// section pages and the sitemap all read. Changes show on the site on the
// next request -- no deploy.
export default async function AdminSectionsPage() {
  const session = await requireAdmin("/admin/sections");
  invalidateCategoryCache();
  const [sections, live] = await Promise.all([listSections({ includeHidden: true }), liveCountsByCategory({ maxAgeMs: 0 })]);
  const rows: SectionRow[] = sections.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    isVisible: s.isVisible,
    comingSoonThreshold: s.comingSoonThreshold,
    live: live.get(s.slug) ?? 0,
    subsections: s.subcategories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, isVisible: c.isVisible, comingSoonThreshold: c.comingSoonThreshold, live: live.get(c.slug) ?? 0 })),
  }));

  return (
    <AdminShell session={session} current="/admin/sections" title="Sections" lede="Sections and subsections as the site shows them. Hidden rows stay in the database; nothing here is ever deleted.">
      <SectionsManager sections={rows} />
    </AdminShell>
  );
}
