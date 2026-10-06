import Link from "next/link";
import { listAllGuides } from "@/db/guides";
import { requireAdmin } from "@/lib/auth/admin";
import { WRITER_NOTE } from "@/lib/guides";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Guides | PortPass admin",
  robots: { index: false, follow: false },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Nassau" });

// Admin -> Guides (brief 11, 3): pages at /guides/[slug], written by the
// founders and linked to live businesses. The five the brief asks for
// start as drafts with an outline; each is published by hand when written.
export default async function AdminGuidesPage() {
  const session = await requireAdmin("/admin/guides");
  const guides = await listAllGuides();

  return (
    <AdminShell session={session} current="/admin/guides" title="Guides" lede="Guides people find on Google, written by you, each linking to businesses they can book. A guide can't be published while an [Antonio: …] note is left in it." actions={<><Link className="admin-bar-link" href="/admin/guides/new">New guide</Link><Link className="admin-bar-link" href="/guides">The public page</Link></>}>
      {guides.length === 0 ? (
        <p className="admin-empty">No guides yet.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Guide</th><th>Status</th><th>Still to write</th><th>Last changed</th></tr></thead>
          <tbody>
            {guides.map((guide) => (
              <tr key={guide.id}>
                <td data-label="Guide"><Link href={`/admin/guides/${guide.id}`}>{guide.title}</Link><br /><code>/guides/{guide.slug}</code></td>
                <td data-label="Status"><span className={`admin-pill ${guide.status === "published" ? "live" : ""}`}>{guide.status === "published" ? "Published" : "Draft"}</span></td>
                <td data-label="Still to write">{(guide.body.match(new RegExp(WRITER_NOTE.source, "g")) ?? []).length || "—"}</td>
                <td data-label="Last changed">{day(guide.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
