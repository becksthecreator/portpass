import { canBeOwner } from "@/lib/futprepRoles";
import { findPersonByEmail } from "./accounts";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The owner bridge (brief 31, A4). Futprep's staff sign in with a PIN; its
// owner dashboard (/business/futprep) opens to a PortPass sign-in with an
// owner membership. An admin or the CEO marks the CEO's staff login as the
// owner here; when that login's email belongs to someone who has signed in
// to PortPass, they get Futprep's org_owner membership with payments. No
// sign-in is created and no invite is sent: until they have signed in once,
// the screen says what to do and the button can be pressed again.

// The staff logins are Futprep's, organisation 1 (app/futprep/staff-auth.ts).
const FUTPREP_ORG_ID = 1;

export type OwnerOutcome = {
  state: "granted" | "needs_email" | "needs_sign_in";
  name: string;
  email: string | null;
};

export async function markFutprepOwner(input: { staffId: number; actorName: string }): Promise<OwnerOutcome> {
  const db = getSupabaseAdmin();
  const { data: row, error } = await db
    .from("staff_members")
    .select("id,name,role,email,active,account_key,is_owner")
    .eq("id", input.staffId)
    .eq("organization_id", FUTPREP_ORG_ID)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the staff login");
  if (!row || !row.active || !row.account_key) throw new Error("ROW_NOT_FOUND");
  if (!canBeOwner(row.role as string)) throw new Error("NOT_A_CEO");

  if (!row.is_owner) {
    // One owner per business (a partial unique index): clear the old mark
    // first, then set the new one.
    const { error: clearError } = await db.from("staff_members").update({ is_owner: false }).eq("organization_id", FUTPREP_ORG_ID).eq("is_owner", true).neq("id", row.id);
    throwIfSupabaseError(clearError, "Could not move the owner mark");
    const { error: markError } = await db.from("staff_members").update({ is_owner: true }).eq("id", row.id).eq("organization_id", FUTPREP_ORG_ID);
    throwIfSupabaseError(markError, "Could not mark the owner");
    await logAudit({ organizationId: FUTPREP_ORG_ID, action: "staff.owner_marked", targetTable: "staff_members", targetId: row.id, after: { name: row.name, by: input.actorName } });
  }

  const name = row.name as string;
  const email = (row.email as string | null) ?? null;
  if (!email) return { state: "needs_email", name, email };
  const person = await findPersonByEmail(email);
  if (!person?.authUserId) return { state: "needs_sign_in", name, email };

  // Owner of Futprep, with payments and the medical view an owner has.
  const { error: memberError } = await db.from("organization_members").upsert(
    { organization_id: FUTPREP_ORG_ID, user_id: person.authUserId, role: "org_owner", can_view_medical: true, can_manage_payments: true },
    { onConflict: "organization_id,user_id" },
  );
  throwIfSupabaseError(memberError, "Could not save the owner membership");
  await logAudit({
    actorUserId: null,
    organizationId: FUTPREP_ORG_ID,
    action: "membership.owner_granted",
    targetTable: "organization_members",
    targetId: person.authUserId,
    after: { role: "org_owner", can_manage_payments: true, from_staff_login: row.id, by: input.actorName },
  });
  return { state: "granted", name, email };
}
