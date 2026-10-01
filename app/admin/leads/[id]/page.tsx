import Link from "next/link";
import { notFound } from "next/navigation";
import { listSections } from "@/db/categories";
import { getLead } from "@/db/leads";
import { requireAdmin } from "@/lib/auth/admin";
import { enrichmentConfigured } from "@/lib/scout/enrich";
import { AdminShell } from "../../_components/AdminShell";
import { LeadCard } from "./LeadCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead | PortPass admin",
  robots: { index: false, follow: false },
};

// One lead: the facts and where they came from, the score and why, the
// draft message with Copy and Open in WhatsApp, and the status. A "do not
// contact" lead has no card: it is hidden everywhere.
export default async function AdminLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const session = await requireAdmin(`/admin/leads/${rawId}`);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [lead, sections] = await Promise.all([getLead(id), listSections({ includeHidden: true })]);
  if (!lead || lead.status === "do_not_contact") notFound();

  return (
    <AdminShell session={session} current="/admin/leads" title={lead.businessName} lede={lead.whatTheyDo ?? undefined} actions={<Link className="admin-bar-link" href="/admin/leads">All leads</Link>}>
      <LeadCard
        lead={lead}
        sections={sections.map((s) => ({ slug: s.slug, name: s.name, subcategories: s.subcategories.map((c) => ({ slug: c.slug, name: c.name })) }))}
        aiReady={enrichmentConfigured()}
      />
    </AdminShell>
  );
}
