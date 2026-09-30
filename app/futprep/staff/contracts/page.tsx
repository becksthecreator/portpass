import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { listContractLines } from "@/db/coachPay";
import { requireFutprepStaff } from "../../staff-auth";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "School contracts | Futprep staff",
  robots: { index: false, follow: false },
};

function money(cents: number) {
  return new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
}

// School contracts (brief 13): coaching a school pays Futprep for. Sessions
// delivered × fee (or the term fee) = what to invoice. No child data here or
// in the CSV.
export default async function ContractsPage() {
  const role = await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/contracts");
  const lines = await listContractLines();

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · School contracts</span></div>
        <nav>
          {role === "ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/staff/admin">Registration desk</Link>
          <Link href="/futprep/staff/programs">Programs</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">The school pays Futprep</span><h1>School contracts.</h1></div>
          <p>Sessions delivered so far and what to invoice each school. Add a contract on the Programs page (type: School contract); staff keep its roster by name and mark attendance as usual.</p>
        </div>
        <p className="coach-export"><a className="secondary-button" href="/api/futprep/staff/contracts/csv">Download invoice CSV (no child data) ↓</a></p>
        {lines.length === 0 && <div className="dashboard-empty"><h3>No school contracts yet.</h3><p>Add one on the Programs page.</p></div>}
        <div className="pay-cards">
          {lines.map((line) => (
            <article className="pay-card" key={`${line.programName}:${line.termName}`}>
              <div className="pay-card-head"><strong>{line.client}</strong><span>{line.programName} · {line.termName}</span></div>
              <dl>
                <div><dt>Billing</dt><dd>{line.billing === "per_session" ? `${money(line.feeCents)} per session` : `${money(line.feeCents)} per term`}</dd></div>
                <div><dt>Sessions</dt><dd>{line.sessionsDelivered} of {line.sessionsScheduled} delivered</dd></div>
                <div className="pay-left"><dt>To invoice</dt><dd>{money(line.invoiceCents)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
