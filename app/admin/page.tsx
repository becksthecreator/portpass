import Link from "next/link";
import { listApplications } from "@/db/applications";
import { AdminApplications } from "./AdminApplications";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const applications = await listApplications();
  return (
    <main className="admin-page">
      <header className="site-header admin-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <span className="admin-badge">Super admin</span>
      </header>
      <section className="admin-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Early access</div>
          <h1>Applications.</h1>
        </div>
        <p>Approve organizations to create their PortPass organization dashboard.</p>
      </section>
      <AdminApplications initialApplications={applications} />
    </main>
  );
}
