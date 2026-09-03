import Link from "next/link";
import { requireFutprepAccount } from "../../staff-auth";
import { listFutprepNotes } from "@/db/notes";
import { NotesManager } from "./NotesManager";
import { StaffLogoutButton } from "../StaffLogoutButton";

export const dynamic="force-dynamic";

export default async function FutprepNotesPage(){
  const account=await requireFutprepAccount(
    ["admin","coach","ceo","kione","adon"],
    "/futprep/lil-kickers/staff/notes"
  );
  const {schemaReady,notes}=await listFutprepNotes();

  return <main className="staff-workspace">
    <header className="staff-workspace-header">
      <div>
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <span className="staff-workspace-label">Futprep · Notes</span>
      </div>
      <nav>
        {(account==="ceo"||account==="adon")&&<Link href="/futprep/lil-kickers/staff/team">Team</Link>}
        <Link href="/futprep/lil-kickers/staff/private-sessions">Private sessions</Link>
        {account==="ceo"&&<Link href="/futprep/lil-kickers/staff/ceo">CEO overview</Link>}
        {account==="admin"&&<Link href="/futprep/lil-kickers/staff/admin">Registration desk</Link>}
        {(account==="coach"||account==="kione")&&<Link href="/futprep/lil-kickers/staff/coach">Coaching area</Link>}
        <StaffLogoutButton />
      </nav>
    </header>

    <section className="staff-workspace-content">
      <div className="staff-page-intro">
        <div><span className="section-kicker">Capture first · organize second</span><h1>Futprep notes.</h1></div>
        <p>A shared inbox for the thoughts that normally disappear into chats: product ideas, parent feedback, brand concepts, leads, operational problems and things we need to revisit.</p>
      </div>
      {!schemaReady&&<div className="staff-migration-warning"><strong>The Notes workspace is built.</strong><span>Run supabase/migrations/202609030002_futprep_notes.sql once to enable live saving and status changes.</span></div>}
      <NotesManager initialNotes={notes} schemaReady={schemaReady} />
    </section>
  </main>;
}
