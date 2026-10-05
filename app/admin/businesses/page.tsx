import Link from "next/link";
import { ChecklistTable } from "@/app/_components/checklist/PageChecklist";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { listBusinessChecklists } from "@/db/pageChecklist";
import { PHOTO_TARGET } from "@/lib/pageChecklist";
import { listCategories, listSections } from "@/db/categories";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/AdminShell";
import { AddBusiness } from "./AddBusiness";
import { hasOwnPages } from "@/lib/orgWorkspaces";
import { BusinessActions } from "./BusinessActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Businesses | PortPass admin",
  robots: { index: false, follow: false },
};

const STATUSES = ["draft", "submitted", "approved", "live", "suspended"];

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-BS", { dateStyle: "medium", timeZone: "America/Nassau" }) : "—";
}

// Every organization with its status, filtered by section and status, and
// what a founder can do to each: approve, send back with a note, publish
// for the owner, send a claim link, suspend and unsuspend (brief 08, 1.2).
// "Add a business" starts a draft and opens the setup wizard.
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ status?: string; section?: string }> }) {
  const session = await requireAdmin("/admin/businesses");
  const { status, section } = await searchParams;
  const [rows, sections, categories, checklists] = await Promise.all([
    listAdminBusinesses({ status: status && STATUSES.includes(status) ? status : null, section: section || null }),
    listSections({ includeHidden: true }),
    listCategories(),
    // What each page is missing (brief 19, part D): every business, whatever
    // the filters above say. A failed read leaves the table off.
    listBusinessChecklists().catch((error) => {
      console.error("admin businesses: page checklists", error instanceof Error ? error.message : "");
      return null;
    }),
  ]);
  const sectionName = (slug: string | null) => categories.find((c) => c.slug === slug)?.name ?? slug ?? "—";
  const href = (next: { status?: string; section?: string }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const c = next.section ?? section;
    if (s) params.set("status", s);
    if (c) params.set("section", c);
    const q = params.toString();
    return `/admin/businesses${q ? `?${q}` : ""}`;
  };

  return (
    <AdminShell session={session} current="/admin/businesses" title="Businesses" lede="draft → submitted → approved → live, or suspended. Approve or send back what owners submit, or add a business yourself." actions={<AddBusiness sections={sections.map((s) => ({ slug: s.slug, name: s.name, subcategories: s.subcategories.map((c) => ({ slug: c.slug, name: c.name })) }))} />}>
      <div className="admin-filters" aria-label="Filter by status">
        <Link href={href({ status: "" })} aria-current={!status ? "true" : undefined}>All statuses</Link>
        {STATUSES.map((s) => <Link key={s} href={href({ status: s })} aria-current={status === s ? "true" : undefined}>{s}</Link>)}
      </div>
      <div className="admin-filters" aria-label="Filter by section">
        <Link href={href({ section: "" })} aria-current={!section ? "true" : undefined}>All sections</Link>
        {sections.map((s) => <Link key={s.slug} href={href({ section: s.slug })} aria-current={section === s.slug ? "true" : undefined}>{s.name}</Link>)}
      </div>
      {rows.length === 0 ? (
        <p className="admin-empty">No businesses match.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Business</th><th>Section</th><th>Status</th><th>Created</th><th>Submitted</th><th>Approved</th><th>Open</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td data-label="Business"><strong>{b.name}</strong>{b.createdByAdmin && !b.claimedAt ? <><br /><small>added by PortPass · not claimed</small></> : null}</td>
                <td data-label="Section">{sectionName(b.section)}{b.subcategory ? ` · ${sectionName(b.subcategory)}` : ""}</td>
                <td data-label="Status"><span className={`admin-pill ${b.status}`}>{b.status}</span>{b.isPublished ? " · public" : ""}</td>
                <td data-label="Created">{when(b.createdAt)}</td>
                <td data-label="Submitted">{when(b.submittedAt)}</td>
                <td data-label="Approved">{when(b.approvedAt)}</td>
                <td data-label="Open">{b.slug ? <><Link href={`/business/${b.slug}`}>Dashboard</Link> · <Link href={`/business/${b.slug}/settings`}>Edit</Link></> : "—"}</td>
                <td data-label="Actions"><BusinessActions id={b.id} name={b.name} status={b.status} createdByAdmin={b.createdByAdmin} claimed={Boolean(b.claimedAt)} isPublic={b.isPublished} canSuspend={!hasOwnPages(b.slug)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="admin-group" id="missing" aria-labelledby="missing-title">
        <h2 id="missing-title">What each page is missing</h2>
        {checklists === null ? (
          <p className="admin-empty">Could not load the checklists. Refresh to try again.</p>
        ) : (
          <>
            <p className="admin-form-note">Every business, read from its data: hero photo, {PHOTO_TARGET} photos, a price, WhatsApp, Instagram, Get paid, a member perk, the Google Business link, and something open to book. Each missing item opens where that business fixes it.</p>
            <ChecklistTable lists={checklists} />
          </>
        )}
      </section>
    </AdminShell>
  );
}
