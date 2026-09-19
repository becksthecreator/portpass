import { requireWeddingStaff } from "../staff-auth";
import { listWeddingLeads } from "@/db/weddingAdmin";
import { AdminNav } from "./AdminNav";
import { LeadInboxManager } from "./LeadInboxManager";

export const dynamic = "force-dynamic";

export default async function WeddingAdminInboxPage() {
  const role = await requireWeddingStaff(["wedding_desk", "antonio"], "/weddings/admin");
  const leads = await listWeddingLeads();

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin" />
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Enquiries</span><h1>The lead inbox.</h1></div>
          <p>Every enquiry from the wedding site and quick form. A tourist enquiry that goes cold is the most expensive thing that happens in this business — anything unanswered past 24 hours is flagged.</p>
        </div>
        <LeadInboxManager initialLeads={leads} />
      </section>
    </main>
  );
}
