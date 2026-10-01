import Link from "next/link";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { GrowthReportView } from "@/app/_components/growth/GrowthReportView";
import { futprepOrganization, getGrowthReport } from "@/db/growth";
import { requireFutprepStaff } from "../../staff-auth";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Growth report | Futprep staff",
  robots: { index: false, follow: false },
};

// The same growth report as /business/futprep/growth (brief 05, part 2),
// reachable with the CEO staff login, which is how Alex signs in today.
export default async function FutprepGrowthPage() {
  await requireFutprepStaff(["ceo"], "/futprep/staff/growth");
  const organization = await futprepOrganization();
  const report = organization ? await getGrowthReport(organization) : null;

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><BrandLogo /></Link>
          <span className="staff-workspace-label">Futprep · Growth report</span>
        </div>
        <nav>
          <Link href="/futprep/staff/ceo">CEO overview</Link>
          <Link href="/futprep/staff/admin">Registration desk</Link>
          <Link href="/futprep/staff/pay">Coach pay</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">This term against last term</span><h1>Growth report.</h1></div>
          <p>Where families found Futprep, who asked, who booked, who paid and who showed up.</p>
        </div>
        {report ? <GrowthReportView report={report} /> : <p>The report isn&rsquo;t available yet.</p>}
      </section>
    </main>
  );
}
