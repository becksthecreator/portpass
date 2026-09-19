import { requireWeddingStaff } from "../../staff-auth";
import { listUnavailableDatesAdmin } from "@/db/weddingAvailability";
import { AdminNav } from "../AdminNav";
import { AvailabilityManager } from "./AvailabilityManager";

export const dynamic = "force-dynamic";

export default async function WeddingAvailabilityAdminPage() {
  const role = await requireWeddingStaff(["antonio"], "/weddings/admin/availability");
  const dates = await listUnavailableDatesAdmin();

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin/availability" />
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Availability</span><h1>Blocked dates.</h1></div>
          <p>Mark dates you&rsquo;re already booked or unavailable. The planner softly warns a couple if they pick one of these dates — it never blocks them, since availability can change.</p>
        </div>
        <AvailabilityManager initialDates={dates} />
      </section>
    </main>
  );
}
