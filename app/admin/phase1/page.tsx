import Link from "next/link";
import "@/app/_components/checklist/checklist.css";
import { loadPhase1Facts } from "@/db/phase1";
import { requireAdmin } from "@/lib/auth/admin";
import { PHASE1_GROUPS, phase1Checks, phase1Summary } from "@/lib/phase1";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Phase 1 | PortPass admin",
  robots: { index: false, follow: false },
};

// Admin -> Phase 1 (brief 19, part F): one page that reads live state and
// shows a tick or a cross for each thing Phase 1 still needs, so what's
// left is visible without asking. A setting is shown only as set or not
// set, by its name: never a value. Each line is a tick or a cross with
// words beside it, so nothing is told by colour alone.
export default async function AdminPhase1Page() {
  const session = await requireAdmin("/admin/phase1");
  const checks = phase1Checks(await loadPhase1Facts(), new Date());

  return (
    <AdminShell session={session} current="/admin/phase1" title="Phase 1" lede="What is in place and what is left, read from the site as it is right now." actions={<Link className="admin-bar-link" href="/admin/businesses#missing">Every page&rsquo;s checklist</Link>}>
      <p className="p1-total"><strong>{phase1Summary(checks)}</strong></p>
      {PHASE1_GROUPS.map((group) => {
        const lines = checks.filter((check) => check.group === group);
        if (lines.length === 0) return null;
        return (
          <section className="admin-group" key={group} aria-labelledby={`p1-${group.toLowerCase()}`}>
            <h2 id={`p1-${group.toLowerCase()}`}>{group}</h2>
            <ul className="p1-list">
              {lines.map((check) => (
                <li key={check.key}>
                  <span className={`pchk-mark ${check.ok ? "is-done" : "is-missing"}`} role="img" aria-label={check.ok ? "In place" : "Not yet"}>{check.ok ? "✓" : "✕"}</span>
                  <div>
                    <strong>{check.href ? <Link href={check.href}>{check.label}</Link> : check.label}</strong>
                    <span>
                      {check.detail}
                      {check.missing && check.missing.length > 0 && (
                        <>
                          {" "}
                          {check.missing.map((item, index) => (
                            <span key={item.href + item.label}>{index > 0 && ", "}<Link href={item.href}>{item.label}</Link></span>
                          ))}
                          .
                        </>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="admin-form-note">Settings are shown as set or not set, by name. No value is read onto this page.</p>
    </AdminShell>
  );
}
