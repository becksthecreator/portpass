import { notFound } from "next/navigation";
import { requireWeddingStaff } from "../../staff-auth";
import { getWeddingLeadDetail } from "@/db/weddingAdmin";
import { AdminNav } from "../AdminNav";
import { LeadDetail } from "./LeadDetail";

export const dynamic = "force-dynamic";

export default async function WeddingLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await requireWeddingStaff(["wedding_desk", "antonio"], "/weddings/admin");
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) notFound();

  const lead = await getWeddingLeadDetail(leadId);
  if (!lead) notFound();

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin" />
      <section className="staff-workspace-content">
        <LeadDetail lead={lead} />
      </section>
    </main>
  );
}
