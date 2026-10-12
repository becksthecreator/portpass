import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { listFutprepLocations } from "@/db/futprepLocations";
import { requireFutprepStaff } from "../../staff-auth";
import { StaffLogoutButton } from "../StaffLogoutButton";
import { LocationsManager } from "./LocationsManager";
import "../coaches.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Locations | Futprep staff",
  robots: { index: false, follow: false },
};

// Where Futprep trains and what each place costs (brief 31, B1). The CEO
// and admin logins; Futprep enters every amount itself.
export default async function FutprepLocationsPage() {
  const role = await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/locations");
  const locations = await listFutprepLocations();

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><BrandLogo /></Link>
          <span className="staff-workspace-label">Futprep · Locations</span>
        </div>
        <nav>
          <Link href="/futprep/staff/ops">Operating map</Link>
          <Link href="/futprep/staff/programs">Programs</Link>
          {role === "ceo" && <Link href="/futprep/staff/pay">Coach pay</Link>}
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">{role === "ceo" ? "CEO" : "Admin"} · where we train</span><h1>Locations.</h1></div>
          <p>Each place Futprep uses, what it costs, when it can be used and whether parents can pick it for a private session. A program with no field cost of its own is costed on Coach pay from its place. A place is switched off, never deleted.</p>
        </div>
        <LocationsManager initialLocations={locations} />
      </section>
    </main>
  );
}
