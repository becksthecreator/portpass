import { requireWeddingStaff } from "../../staff-auth";
import { getWeddingSiteSettings } from "@/db/weddingSite";
import { AdminNav } from "../AdminNav";
import { ContentManager } from "./ContentManager";

export const dynamic = "force-dynamic";

export default async function WeddingContentAdminPage() {
  const role = await requireWeddingStaff(["wedding_desk", "antonio"], "/weddings/admin/content");
  const settings = await getWeddingSiteSettings();

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin/content" />
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Site content</span><h1>Trust numbers &amp; reviews.</h1></div>
          <p>These feed the trust strip and reviews section on the public homepage.</p>
        </div>
        <ContentManager initialSettings={settings} />
        <div className="wedding-admin-panel">
          <h2>Not editable here yet</h2>
          <p>Biography text, ceremony type descriptions, FAQ entries, and the contact number are still hardcoded on the page and need a developer to change for now — flagged as follow-up work. The reviews widget and trust numbers above are the highest-value pieces and are fully editable today.</p>
        </div>
      </section>
    </main>
  );
}
