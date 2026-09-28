import Link from "next/link";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { listCategories, listSections } from "@/db/categories";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Businesses | PortPass admin",
  robots: { index: false, follow: false },
};

const STATUSES = ["draft", "submitted", "approved", "live", "suspended"];

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-BS", { dateStyle: "medium", timeZone: "America/Nassau" }) : "—";
}

// Every organization with its status. Filters by section and status;
// approve / send back / suspend and "Add a business" arrive in the next
// build (A2) -- until then the wizard link opens any business as admin.
export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<{ status?: string; section?: string }> }) {
  const session = await requireAdmin("/admin/businesses");
  const { status, section } = await searchParams;
  const [rows, sections, categories] = await Promise.all([
    listAdminBusinesses({ status: status && STATUSES.includes(status) ? status : null, section: section || null }),
    listSections({ includeHidden: true }),
    listCategories(),
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
    <AdminShell session={session} current="/admin/businesses" title="Businesses" lede="draft → submitted → approved → live, or suspended. Approvals and concierge onboarding land in the next build.">
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
          <thead><tr><th>Business</th><th>Section</th><th>Status</th><th>Created</th><th>Submitted</th><th>Approved</th><th>Open</th></tr></thead>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
