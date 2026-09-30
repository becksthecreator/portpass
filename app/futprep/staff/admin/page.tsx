import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { requireFutprepStaff } from "../../staff-auth";
import { listFutprepStaffRegistrations, getFutprepMoneySummary } from "@/db/staff";
import { AdminRegistrationManager } from "./AdminRegistrationManager";
import { AddRegistrationForm, type StaffClassOption } from "./AddRegistrationForm";
import { listFutprepOffers } from "@/db/registrations";
import { offerHeadline } from "@/lib/futprepTerms";
import { MoneySummary } from "./MoneySummary";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic = "force-dynamic";

export default async function FutprepStaffAdminPage() {
  const role = await requireFutprepStaff(["admin","ceo"], "/futprep/staff/admin");
  const [registrations, moneySummary, offers] = await Promise.all([
    listFutprepStaffRegistrations(),
    getFutprepMoneySummary(),
    listFutprepOffers().catch(() => []),
  ]);

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><BrandLogo /></Link>
          <span className="staff-workspace-label">Futprep · Registration desk</span>
        </div>
        <nav>
          {role==="ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/staff/private-sessions">Private sessions</Link>
          <Link href="/futprep/staff/programs">Programs</Link>
          <Link href="/futprep/staff/contracts">Contracts</Link>
          <Link href="/futprep/staff/pay">Coach pay</Link>
          <Link href="/futprep/staff/accounts">Staff accounts</Link>
          <Link href="/sports-fitness/futprep-athletics/lil-kickers">Parent view ↗</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Registrations & payments</span><h1>Registration desk.</h1></div>
          <p>Send parents the registration link, confirm children, and keep payment status current. Coaches see those updates automatically in their own areas.</p>
        </div>
        <MoneySummary summary={moneySummary} />
        <p className="coach-export"><a className="secondary-button" href="/futprep/staff/import">Import families from TeamSnap →</a></p>
        <AdminRegistrationManager initialRegistrations={registrations} />
        <div className="team-admin-panels">
          <AddRegistrationForm options={offers.map((offer): StaffClassOption => ({ key: `${offer.programId}:${offer.termId}`, programSlug: offer.slug, termId: offer.termId, label: `${offerHeadline(offer)} (ages ${offer.ageLabel})` }))} />
        </div>
      </section>
    </main>
  );
}
