import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { listFutprepPrograms } from "@/db/programs";
import { requireFutprepStaff } from "../../staff-auth";
import { StaffLogoutButton } from "../StaffLogoutButton";
import { TeamsnapImporter } from "./TeamsnapImporter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import from TeamSnap | Futprep staff",
  robots: { index: false, follow: false },
};

// Import from TeamSnap (brief 13, part 5): the families who signed up on
// TeamSnap get their details onto the PortPass registrations staff already
// added by name. One class at a time, preview first. Nothing is sent to
// parents; each family still confirms through their completion link.
export default async function TeamsnapImportPage() {
  const role = await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/import");
  const programs = await listFutprepPrograms();
  const classes = programs
    .filter((program) => program.term)
    .map((program) => ({ programId: program.id, termId: program.term!.id, label: `${program.name} · ${program.term!.name}` }));

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div><Link className="brand" href="/"><BrandLogo /></Link><span className="staff-workspace-label">Futprep · Import from TeamSnap</span></div>
        <nav>
          {role === "ceo" && <Link href="/futprep/staff/ceo">CEO overview</Link>}
          <Link href="/futprep/staff/admin">Registration desk</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">One-off · families who signed up on TeamSnap</span><h1>Import from TeamSnap.</h1></div>
          <p>Export the class roster from TeamSnap as CSV, then paste it or upload it here. PortPass matches each child by name to the registrations you added, and fills in only what&apos;s missing: parent, emergency contact, date of birth, and medical notes when TeamSnap has them. You see everything before it saves. Nothing is sent to parents; each family still confirms consent through their completion link.</p>
        </div>
        <TeamsnapImporter classes={classes} />
      </section>
    </main>
  );
}
