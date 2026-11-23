import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { listClassPosts, listFeedClasses } from "@/db/classFeed";
import { currentFutprepStaffAccount, requireFutprepStaff } from "../../staff-auth";
import { StaffLogoutButton } from "../StaffLogoutButton";
import { ClassFeedManager } from "./ClassFeedManager";
import "../coaches.css";
import "./feed.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Class updates | Futprep staff",
  robots: { index: false, follow: false },
};

// The class feed, staff side (Nov 2026): post an update to one class, and
// its parents read it on /futprep/feed and get it by email. It replaces
// the per-class WhatsApp groups.
export default async function ClassFeedStaffPage() {
  const role = await requireFutprepStaff(["coach", "admin", "ceo"], "/futprep/staff/feed");
  const account = (await currentFutprepStaffAccount()) ?? "";
  const classes = await listFeedClasses();
  const first = classes.find((c) => c.families > 0) ?? classes[0] ?? null;
  const posts = first ? await listClassPosts(first.programId, first.termId) : [];

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Class updates</span></div>
        <nav>
          <Link href="/futprep/staff/coach">Coach</Link>
          <Link href="/futprep/staff/admin">Desk</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">In place of the WhatsApp groups</span><h1>Class updates.</h1></div>
          <p>Write to one class at a time. Every family with a child in that class gets it by email, one email each, and can read all the updates on their Futprep page.</p>
        </div>
        {first ? (
          <ClassFeedManager classes={classes} initialKey={`${first.programId}:${first.termId}`} initialPosts={posts} viewer={{ role, account }} />
        ) : (
          <div className="dashboard-empty">
            <h3>No class is running right now.</h3>
            <p>Classes show here once a term is set up and active.</p>
          </div>
        )}
      </section>
    </main>
  );
}
