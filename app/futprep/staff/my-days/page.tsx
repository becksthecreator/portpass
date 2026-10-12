import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { getCoachDays } from "@/db/coaches";
import { requireFutprepStaff } from "../../staff-auth";
import { currentInboxViewer } from "../private-sessions/viewer";
import { StaffLogoutButton } from "../StaffLogoutButton";
import { MyDaysManager } from "./MyDaysManager";
import "../coaches.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My days | Futprep staff",
  robots: { index: false, follow: false },
};

// My days (brief 31, C2): the signed-in coach's own working days and days
// away. Parents can't pick a day away, and the booking form says so.
export default async function MyDaysPage() {
  await requireFutprepStaff(["coach", "admin", "ceo"], "/futprep/staff/my-days");
  const { viewer } = await currentInboxViewer();
  const days = viewer.coachId !== null ? await getCoachDays(viewer.coachId) : null;

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · My days</span></div>
        <nav>
          <Link href="/futprep/staff/private-sessions">Private sessions</Link>
          <Link href="/futprep/staff/pay">My pay</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">{days ? days.name : "Your days"}</span><h1>My days.</h1></div>
          <p>The days you take private sessions, and the days you&rsquo;re away. Parents only see times on your days, a day away can&rsquo;t be booked, and the form tells them you&rsquo;re away that day. With no days set, parents are told you&rsquo;ll confirm a time.</p>
        </div>
        {days ? (
          <MyDaysManager initial={days} />
        ) : (
          <div className="dashboard-empty">
            <h3>Your login isn&rsquo;t linked to a coach profile yet.</h3>
            <p>Ask Alex to link it on Coach pay. Then your days are set here.</p>
          </div>
        )}
      </section>
    </main>
  );
}
