import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listPayCoaches, listPayLedger, listProgramPnl, listStaffLogins } from "@/db/coachPay";
import { summarizePay } from "@/lib/coachPay";
import { StaffLogoutButton } from "../StaffLogoutButton";
import { payNeedsStepUp, resolvePayAccess } from "./access";
import { CoachPayManager } from "./CoachPayManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coach pay | Futprep staff",
  robots: { index: false, follow: false },
};

// Coach pay (brief 13). Alex and platform owners see every coach, the pay
// rates and the program P&L; any other staff login sees only its own
// coach's pay.
export default async function CoachPayPage() {
  const access = await resolvePayAccess();
  if (!access && (await payNeedsStepUp())) redirect(`/admin/verify?next=${encodeURIComponent("/futprep/staff/pay")}`);
  if (!access) redirect(`/futprep/staff/login?returnTo=${encodeURIComponent("/futprep/staff/pay")}`);
  const all = access.kind === "all";
  const ownCoach = access.kind === "own" ? access.coach : null;

  const [ledger, coaches, logins, pnl] = await Promise.all([
    all ? listPayLedger() : ownCoach ? listPayLedger({ coachId: ownCoach.id }) : Promise.resolve([]),
    all ? listPayCoaches() : Promise.resolve([]),
    all ? listStaffLogins() : Promise.resolve([]),
    all ? listProgramPnl() : Promise.resolve([]),
  ]);

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Coach pay</span></div>
        <nav>
          <Link href="/futprep/staff/coach">Coaching area</Link>
          {all && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          {all && <Link href="/futprep/staff/contracts">Contracts</Link>}
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div>
            <span className="section-kicker">{all ? "Every coach · pay rates · program P&L" : ownCoach ? ownCoach.name : "Your pay"}</span>
            <h1>{all ? "Coach pay." : "Your pay."}</h1>
          </div>
          <p>{all
            ? "Sessions coached, owed and paid, per coach and month. Mark a month paid when the money goes out. Coaches see only their own."
            : "The sessions you coached, what you're owed and what's been paid. Only you, Alex and PortPass's owners can see this."}</p>
        </div>
        {access.kind === "own" && !ownCoach ? (
          <div className="dashboard-empty">
            <h3>Your login isn&apos;t linked to a coach profile yet.</h3>
            <p>Ask Alex to link it on the Coach pay page.</p>
          </div>
        ) : (
          <CoachPayManager canManage={all} summaries={summarizePay(ledger)} coaches={coaches} logins={logins} pnl={pnl} />
        )}
      </section>
    </main>
  );
}
