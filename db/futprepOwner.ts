import { canBeOwner } from "@/lib/futprepRoles";
import { findPersonByEmail } from "./accounts";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The owner bridge (brief 31, A4). Futprep's staff sign in with a PIN; its
// owner dashboard (/business/futprep) opens to a PortPass sign-in with an
// owner membership. Two steps, so a staff PIN session alone can never make
// anyone an owner on PortPass (review of PR #197):
//
//   1. On Staff accounts, an admin or the CEO marks the CEO's staff login
//      as the owner. That only asks: no membership is written.
//   2. In Admin -> People, a founder (platform owner, admin second step)
//      checks with the person and grants the org_owner membership, with
//      payments, to the PortPass sign-in that has the login's email.
//
// The grant is recorded on the staff row (owner_user_id) and taken back
// when the mark moves to another login, the login is switched off, or its
// email changes. No sign-in is created and no invite is sent.

// The staff logins are Futprep's, organisation 1 (app/futprep/staff-auth.ts).
export const FUTPREP_ORG_ID = 1;

export type OwnerState = "needs_email" | "needs_sign_in" | "waiting_for_founder" | "granted";

export type OwnerOutcome = { state: OwnerState; name: string; email: string | null };

type OwnerRow = { id: number; name: string; role: string; email: string | null; active: boolean; account_key: string | null; is_owner: boolean; owner_user_id: string | null };

const OWNER_COLUMNS = "id,name,role,email,active,account_key,is_owner,owner_user_id";

async function loadRow(staffId: number): Promise<OwnerRow | null> {
  const { data, error } = await getSupabaseAdmin().from("staff_members").select(OWNER_COLUMNS).eq("id", staffId).eq("organization_id", FUTPREP_ORG_ID).maybeSingle();
  throwIfSupabaseError(error, "Could not load the staff login");
  return (data as OwnerRow | null) ?? null;
}

// Where a marked login stands. "granted" only when the grant on the row is
// for the PortPass sign-in its email belongs to today.
async function stateOf(row: OwnerRow): Promise<{ state: OwnerState; authUserId: string | null }> {
  if (!row.email) return { state: "needs_email", authUserId: null };
  const person = await findPersonByEmail(row.email);
  const authUserId = person?.authUserId ?? null;
  if (!authUserId) return { state: "needs_sign_in", authUserId: null };
  return { state: row.owner_user_id === authUserId ? "granted" : "waiting_for_founder", authUserId };
}

// Takes back the owner membership a founder gave from this login, if any:
// the org_owner row for the recorded sign-in is removed and the record
// cleared, with an audit line saying why. A membership made any other way
// (an invitation, a claim link, Admin -> People) is never recorded here,
// so it is never touched.
export async function revokeFutprepOwnerGrant(input: { staffId: number; reason: "mark_moved" | "login_switched_off" | "email_changed"; actor: string; actorUserId?: string | null }): Promise<boolean> {
  const db = getSupabaseAdmin();
  const row = await loadRow(input.staffId);
  if (!row?.owner_user_id) return false;
  const { error: memberError } = await db.from("organization_members").delete().eq("organization_id", FUTPREP_ORG_ID).eq("user_id", row.owner_user_id).eq("role", "org_owner");
  throwIfSupabaseError(memberError, "Could not take back the owner membership");
  const { error: clearError } = await db.from("staff_members").update({ owner_user_id: null }).eq("id", row.id).eq("organization_id", FUTPREP_ORG_ID);
  throwIfSupabaseError(clearError, "Could not clear the owner grant");
  await logAudit({
    actorUserId: input.actorUserId ?? null,
    organizationId: FUTPREP_ORG_ID,
    action: "membership.owner_revoked",
    targetTable: "organization_members",
    targetId: row.owner_user_id,
    before: { role: "org_owner", from_staff_login: row.id },
    after: { reason: input.reason, by: input.actor },
  });
  return true;
}

// Step 1, from Staff accounts: mark the CEO's login as the owner. Writes
// no membership. Moving the mark takes back the previous login's grant.
export async function markFutprepOwner(input: { staffId: number; actorName: string }): Promise<OwnerOutcome> {
  const db = getSupabaseAdmin();
  const row = await loadRow(input.staffId);
  if (!row || !row.active || !row.account_key) throw new Error("ROW_NOT_FOUND");
  if (!canBeOwner(row.role)) throw new Error("NOT_A_CEO");

  if (!row.is_owner) {
    // One owner per business (a partial unique index): take back the old
    // login's grant, clear its mark, then set the new one.
    const { data: previous, error: previousError } = await db.from("staff_members").select("id").eq("organization_id", FUTPREP_ORG_ID).eq("is_owner", true).neq("id", row.id);
    throwIfSupabaseError(previousError, "Could not find the previous owner mark");
    for (const old of previous ?? []) await revokeFutprepOwnerGrant({ staffId: Number(old.id), reason: "mark_moved", actor: input.actorName });
    const { error: clearError } = await db.from("staff_members").update({ is_owner: false }).eq("organization_id", FUTPREP_ORG_ID).eq("is_owner", true).neq("id", row.id);
    throwIfSupabaseError(clearError, "Could not move the owner mark");
    const { error: markError } = await db.from("staff_members").update({ is_owner: true }).eq("id", row.id).eq("organization_id", FUTPREP_ORG_ID);
    throwIfSupabaseError(markError, "Could not mark the owner");
    await logAudit({ organizationId: FUTPREP_ORG_ID, action: "staff.owner_marked", targetTable: "staff_members", targetId: row.id, after: { name: row.name, by: input.actorName } });
  }
  return { state: (await stateOf({ ...row, is_owner: true })).state, name: row.name, email: row.email };
}

export type FutprepOwnerRequest = {
  staffId: number;
  name: string;
  email: string | null;
  state: OwnerState;
  loginActive: boolean;
};

// For Admin -> People: the login marked as Futprep's owner, if any, and
// where it stands.
export async function futprepOwnerRequest(): Promise<FutprepOwnerRequest | null> {
  const { data, error } = await getSupabaseAdmin().from("staff_members").select(OWNER_COLUMNS).eq("organization_id", FUTPREP_ORG_ID).eq("is_owner", true).maybeSingle();
  throwIfSupabaseError(error, "Could not load Futprep's owner mark");
  if (!data) return null;
  const row = data as OwnerRow;
  return { staffId: row.id, name: row.name, email: row.email, state: (await stateOf(row)).state, loginActive: row.active && row.account_key !== null };
}

// Step 2, by a founder in Admin -> People (the route checks the platform
// role and the admin second step): the org_owner membership, with
// payments and the medical view an owner has, for the PortPass sign-in
// that has the marked login's email. Someone already in Futprep is
// refused: their role is changed in the People table, where it is theirs
// to keep, rather than here, where it can be taken back.
export async function grantFutprepOwner(input: { staffId: number; founderUserId: string }): Promise<OwnerOutcome> {
  const db = getSupabaseAdmin();
  const row = await loadRow(input.staffId);
  if (!row || !row.active || !row.account_key || !row.is_owner) throw new Error("NOT_MARKED");
  if (!canBeOwner(row.role)) throw new Error("NOT_A_CEO");
  const { state, authUserId } = await stateOf(row);
  if (state !== "waiting_for_founder" || !authUserId) return { state, name: row.name, email: row.email };

  const { data: existing, error: existingError } = await db.from("organization_members").select("role").eq("organization_id", FUTPREP_ORG_ID).eq("user_id", authUserId).maybeSingle();
  throwIfSupabaseError(existingError, "Could not check the membership");
  if (existing) throw new Error("ALREADY_MEMBER");

  // A grant from this login to a different sign-in (the email changed some
  // other way than Staff accounts): take that back first.
  if (row.owner_user_id) await revokeFutprepOwnerGrant({ staffId: row.id, reason: "email_changed", actor: "founder", actorUserId: input.founderUserId });

  const { error: memberError } = await db.from("organization_members").insert(
    { organization_id: FUTPREP_ORG_ID, user_id: authUserId, role: "org_owner", can_view_medical: true, can_manage_payments: true, invited_by: input.founderUserId },
  );
  throwIfSupabaseError(memberError, "Could not save the owner membership");
  const { error: recordError } = await db.from("staff_members").update({ owner_user_id: authUserId }).eq("id", row.id).eq("organization_id", FUTPREP_ORG_ID);
  throwIfSupabaseError(recordError, "Could not record the owner grant");
  await logAudit({
    actorUserId: input.founderUserId,
    organizationId: FUTPREP_ORG_ID,
    action: "membership.owner_granted",
    targetTable: "organization_members",
    targetId: authUserId,
    after: { role: "org_owner", can_manage_payments: true, from_staff_login: row.id },
  });
  return { state: "granted", name: row.name, email: row.email };
}
