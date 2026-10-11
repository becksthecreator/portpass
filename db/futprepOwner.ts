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
//      as the owner. That only asks: no membership is written. Moving an
//      existing mark to another login is for the CEO login only.
//   2. In Admin -> People, a founder (platform owner, admin second step)
//      checks with the person and grants the org_owner membership, with
//      payments, for the email the founder saw: if the login's email has
//      changed since, the grant is refused.
//
// Grant, take back and email changes run in the database as one locked
// transaction each (supabase/migrations/202610210002). The grant records
// the membership's own id on the staff row, and only that membership is
// ever taken back: when the mark moves, the login is switched off, or its
// email changes. No sign-in is created and no invite is sent.

// The staff logins are Futprep's, organisation 1 (app/futprep/staff-auth.ts).
export const FUTPREP_ORG_ID = 1;

// What Admin -> People sees.
export type OwnerState = "needs_email" | "needs_sign_in" | "waiting_for_founder" | "granted";
// What the staff screens see: never whether an address has a PortPass
// sign-in, so the staff screen can't be used to test addresses.
export type StaffOwnerState = "needs_email" | "waiting" | "granted";

export type OwnerOutcome = { state: StaffOwnerState; name: string; email: string | null };

type OwnerRow = { id: number; name: string; role: string; email: string | null; active: boolean; account_key: string | null; is_owner: boolean; owner_member_id: number | null };

const OWNER_COLUMNS = "id,name,role,email,active,account_key,is_owner,owner_member_id";

async function loadRow(staffId: number): Promise<OwnerRow | null> {
  const { data, error } = await getSupabaseAdmin().from("staff_members").select(OWNER_COLUMNS).eq("id", staffId).eq("organization_id", FUTPREP_ORG_ID).maybeSingle();
  throwIfSupabaseError(error, "Could not load the staff login");
  return (data as OwnerRow | null) ?? null;
}

// Granted only while the membership the grant made is still there as an
// owner: one a founder removed or changed in People doesn't count.
async function grantStands(row: OwnerRow): Promise<boolean> {
  if (row.owner_member_id === null) return false;
  const { data, error } = await getSupabaseAdmin().from("organization_members").select("id").eq("id", row.owner_member_id).eq("organization_id", FUTPREP_ORG_ID).eq("role", "org_owner").maybeSingle();
  throwIfSupabaseError(error, "Could not check the owner membership");
  return Boolean(data);
}

async function stateOf(row: OwnerRow): Promise<OwnerState> {
  if (!row.email) return "needs_email";
  if (await grantStands(row)) return "granted";
  const person = await findPersonByEmail(row.email);
  return person?.authUserId ? "waiting_for_founder" : "needs_sign_in";
}

export function staffOwnerState(state: OwnerState): StaffOwnerState {
  return state === "needs_email" || state === "granted" ? state : "waiting";
}

const RPC_ERRORS = ["NOT_MARKED", "NOT_A_CEO", "EMAIL_CHANGED", "ALREADY_MEMBER", "ROW_NOT_FOUND"] as const;
function rpcError(error: { message?: string; code?: string } | null, what: string): void {
  if (!error) return;
  const known = RPC_ERRORS.find((code) => (error.message ?? "").includes(code));
  if (known) throw new Error(known);
  throwIfSupabaseError(error, what);
}

// Takes back the membership this login's grant made, if it is still that
// grant; an audit line says why. Returns whether a membership went.
export async function revokeFutprepOwnerGrant(input: { staffId: number; reason: "mark_moved" | "login_switched_off" | "email_changed"; actor: string; actorUserId?: string | null }): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("futprep_owner_revoke", { p_org: FUTPREP_ORG_ID, p_staff_id: input.staffId, p_reason: input.reason, p_actor: input.actor, p_actor_user: input.actorUserId ?? null });
  rpcError(error, "Could not take back the owner membership");
  return data === true;
}

// A staff login's email, with any owner grant on it taken back in the same
// transaction. Returns whether it changed.
export async function setFutprepStaffEmail(input: { staffId: number; email: string | null; actor: string }): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("futprep_staff_set_email", { p_org: FUTPREP_ORG_ID, p_staff_id: input.staffId, p_email: input.email, p_actor: input.actor });
  rpcError(error, "Could not save the email");
  return data === true;
}

// Step 1, from Staff accounts: mark the CEO's login as the owner. Writes
// no membership. Moving a mark another login holds is the CEO login's to
// do, and takes back that login's grant: the old mark is cleared first, so
// a founder's grant can't land on it in between.
export async function markFutprepOwner(input: { staffId: number; actorName: string; actorRole: string }): Promise<OwnerOutcome> {
  const db = getSupabaseAdmin();
  const row = await loadRow(input.staffId);
  if (!row || !row.active || !row.account_key) throw new Error("ROW_NOT_FOUND");
  if (!canBeOwner(row.role)) throw new Error("NOT_A_CEO");

  if (!row.is_owner) {
    const { data: previous, error: previousError } = await db.from("staff_members").select("id").eq("organization_id", FUTPREP_ORG_ID).eq("is_owner", true).neq("id", row.id);
    throwIfSupabaseError(previousError, "Could not find the previous owner mark");
    if ((previous ?? []).length > 0 && input.actorRole !== "ceo") throw new Error("CEO_ONLY_MOVE");
    const { error: clearError } = await db.from("staff_members").update({ is_owner: false }).eq("organization_id", FUTPREP_ORG_ID).eq("is_owner", true).neq("id", row.id);
    throwIfSupabaseError(clearError, "Could not move the owner mark");
    const { error: markError } = await db.from("staff_members").update({ is_owner: true }).eq("id", row.id).eq("organization_id", FUTPREP_ORG_ID);
    throwIfSupabaseError(markError, "Could not mark the owner");
    await logAudit({ organizationId: FUTPREP_ORG_ID, action: "staff.owner_marked", targetTable: "staff_members", targetId: row.id, after: { name: row.name, by: input.actorName } });
  }
  // Any other login that still carries a grant loses it, marked or not.
  const { data: granted, error: grantedError } = await db.from("staff_members").select("id").eq("organization_id", FUTPREP_ORG_ID).not("owner_member_id", "is", null).neq("id", row.id);
  throwIfSupabaseError(grantedError, "Could not find earlier owner grants");
  for (const old of granted ?? []) await revokeFutprepOwnerGrant({ staffId: Number(old.id), reason: "mark_moved", actor: input.actorName });

  return { state: staffOwnerState(await stateOf({ ...row, is_owner: true })), name: row.name, email: row.email };
}

// For the staff screens: where the marked login stands, without saying
// whether an address has a PortPass sign-in.
export async function futprepOwnerStaffState(): Promise<{ staffId: number; state: StaffOwnerState } | null> {
  const request = await futprepOwnerRequest();
  return request ? { staffId: request.staffId, state: staffOwnerState(request.state) } : null;
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
  return { staffId: row.id, name: row.name, email: row.email, state: await stateOf(row), loginActive: row.active && row.account_key !== null };
}

// Step 2, by a founder in Admin -> People (the route checks the platform
// role and the admin second step): the org_owner membership, with
// payments and the medical view an owner has, for the PortPass sign-in of
// the email the founder saw. The database refuses it if the login is no
// longer marked, active and a CEO login, if its email is no longer that
// one, or if the person is already in Futprep.
export async function grantFutprepOwner(input: { staffId: number; email: string; founderUserId: string }): Promise<{ state: "granted"; name: string; email: string }> {
  const row = await loadRow(input.staffId);
  if (!row || !row.active || !row.account_key || !row.is_owner) throw new Error("NOT_MARKED");
  const email = input.email.trim().toLowerCase();
  const person = email ? await findPersonByEmail(email) : null;
  if (!person?.authUserId) throw new Error("NO_SIGN_IN");
  const { error } = await getSupabaseAdmin().rpc("futprep_owner_grant", { p_org: FUTPREP_ORG_ID, p_staff_id: input.staffId, p_email: email, p_user: person.authUserId, p_founder: input.founderUserId });
  rpcError(error, "Could not give owner access");
  return { state: "granted", name: row.name, email };
}
