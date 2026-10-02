import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide } from "@/db/guides";
import { listAdminBusinesses } from "@/db/adminBusinesses";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../../_components/AdminShell";
import { GuideEditor } from "../GuideEditor";
import "@/app/guides/guides.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Guide | PortPass admin",
  robots: { index: false, follow: false },
};

// One guide: its words, the businesses it links to, and publishing.
export default async function AdminGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const session = await requireAdmin(`/admin/guides/${encodeURIComponent(raw)}`);
  const isNew = raw === "new";
  if (!isNew && !/^\d{1,12}$/.test(raw)) notFound();
  const [guide, businesses] = await Promise.all([isNew ? Promise.resolve(null) : getGuide(Number(raw)), listAdminBusinesses().then((all) => all.filter((business) => business.isPublished && business.status !== "suspended")).catch(() => [])]);
  if (!isNew && !guide) notFound();

  return (
    <AdminShell
      session={session}
      current="/admin/guides"
      title={guide ? guide.title : "New guide"}
      lede={guide ? `${guide.status === "published" ? "Published" : "Draft"} · /guides/${guide.slug}` : "Saved as a draft. Nobody sees it until you publish it."}
      actions={<><Link className="admin-bar-link" href="/admin/guides">All guides</Link>{guide?.status === "published" && <a className="admin-bar-link" href={`/guides/${guide.slug}`}>Open it</a>}</>}
    >
      <GuideEditor
        guide={guide ? { id: guide.id, slug: guide.slug, title: guide.title, description: guide.description, body: guide.body, status: guide.status, publishedAt: guide.publishedAt, listings: guide.listings.map((listing) => ({ organizationId: listing.organizationId, note: listing.note ?? "" })) } : null}
        businesses={businesses.map((business) => ({ id: business.id, name: business.name }))}
      />
    </AdminShell>
  );
}
