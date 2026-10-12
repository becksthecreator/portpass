import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logAudit } from "@/db/audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/db/supabase";
import { canSeeMedical } from "@/lib/futprepRoles";
import { burnPinCheck, hashPin, verifyPin } from "@/lib/pinHash";
import { issueStaffToken, readStaffToken, staffTokenValid } from "@/lib/staffSession";

// Accounts are created dynamically by an admin (see createStaffAccount below)
// rather than being a fixed, hardcoded list. Roles stay a fixed set of four —
// what each role can do is enforced by the allowed-role arrays each staff
// page/route passes to requireFutprepStaff.
export type FutprepStaffRole = "admin" | "coach" | "ceo" | "helper";
export const FUTPREP_STAFF_ROLES: FutprepStaffRole[] = ["admin", "coach", "ceo", "helper"];

export type FutprepStaffAccountRecord = {
  id: number;
  name: string;
  accountKey: string;
  role: FutprepStaffRole;
  active: boolean;
  // When the person last changed their own PIN; null means they're still
  // on the one an admin set for them. Never the PIN, never the hash.
  pinChangedAt: string | null;
  // Where the Saturday "mark attendance" reminder and the monthly growth
  // report are sent (brief 05). Optional.
  email: string | null;
  // Brief 31 (A): an admin login sees a child's medical details only with
  // this on (the CEO login always does); and the one login marked owner.
  canViewMedical: boolean;
  isOwner: boolean;
};

// A staff row with no login yet (brief 31, A3): a coach or teammate an
// admin can give an account name and a starting PIN to, so the person keeps
// one row instead of a second one being created for them.
export type FutprepStaffWithoutLogin = { id: number; name: string; role: string; email: string | null };

// New and changed PINs are six digits or more (round 4, item 10). Existing
// shorter PINs keep working until their owner changes them.
export const PIN_PATTERN = /^\d{6,}$/;

const COOKIE = "portpass_futprep_staff";
const FUTPREP_ORG_ID = 1;
const ACCOUNT_CACHE_TTL_MS = 30_000;
const ACCOUNT_KEY_PATTERN = /^[a-z0-9_-]{3,40}$/;

function isFutprepStaffRole(value: string): value is FutprepStaffRole {
  return (FUTPREP_STAFF_ROLES as string[]).includes(value);
}

type CachedAccount = { id: number; name: string; role: FutprepStaffRole; pinHash: string; active: boolean; canViewMedical: boolean };

// Account + role + PIN hash live in Supabase (staff_members) rather than
// Vercel env vars or hardcoded literals, so staff can be added/removed
// without a deploy. Cached briefly per server instance to avoid a DB round
// trip on every request.
let accountCache: { value: Map<string, CachedAccount>; expires: number } | null = null;

async function loadAccounts(): Promise<Map<string, CachedAccount>> {
  if (accountCache && accountCache.expires > Date.now()) return accountCache.value;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff_members")
    .select("id, name, role, account_key, pin_hash, active, can_view_medical")
    .eq("organization_id", FUTPREP_ORG_ID)
    .not("account_key", "is", null)
    .not("pin_hash", "is", null);

  throwIfSupabaseError(error, "Failed to load Futprep staff accounts");

  const map = new Map<string, CachedAccount>();
  for (const row of data ?? []) {
    const key = row.account_key as string | null;
    const role = row.role as string | null;
    const hash = row.pin_hash as string | null;
    if (key && hash && role && isFutprepStaffRole(role)) {
      map.set(key, { id: Number(row.id), name: row.name as string, role, pinHash: hash, active: Boolean(row.active), canViewMedical: Boolean(row.can_view_medical) });
    }
  }

  accountCache = { value: map, expires: Date.now() + ACCOUNT_CACHE_TTL_MS };
  return map;
}

function invalidateAccountCache() {
  accountCache = null;
}

async function accountByKey(accountKey: string): Promise<CachedAccount | null> {
  const accounts = await loadAccounts();
  const account = accounts.get(accountKey);
  return account && account.active ? account : null;
}

// A PIN stored the old way (unsalted SHA-256) is replaced by the salted
// scrypt form on its owner's next correct sign-in (Brief 24, part D). The
// session token is signed over the stored hash, so the token issued now
// carries the new one; a session of the same account still open on another
// device ends and signs in again. If the write fails the sign-in still
// goes through on the old hash and the next sign-in tries again.
async function upgradeStoredPin(account: CachedAccount, pin: string): Promise<string> {
  const newHash = await hashPin(pin);
  // Only the row that still holds the hash this check saw: two sign-ins of
  // one account at the same moment then agree on one new hash, the first
  // to write it, and the other signs its token over what is stored.
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("staff_members")
    .update({ pin_hash: newHash })
    .eq("id", account.id)
    .eq("organization_id", FUTPREP_ORG_ID)
    .eq("pin_hash", account.pinHash)
    .select("id");
  if (error) {
    console.error("staff pin upgrade failed", error.message);
    return account.pinHash;
  }
  invalidateAccountCache();
  if ((data ?? []).length === 1) return newHash;
  const { data: fresh } = await db.from("staff_members").select("pin_hash").eq("id", account.id).maybeSingle();
  return (fresh?.pin_hash as string | null) ?? account.pinHash;
}

export async function makeStaffToken(accountKey: string, pin: string) {
  const account = await accountByKey(accountKey);
  if (!account) {
    // The same work as a real check, so the answer's timing does not say
    // whether the account name exists.
    await burnPinCheck(pin);
    return null;
  }
  const check = await verifyPin(pin, account.pinHash);
  if (!check.ok) return null;
  const pinHash = check.upgrade ? await upgradeStoredPin(account, pin) : account.pinHash;
  // Signed with a server secret and dated (lib/staffSession.ts).
  return issueStaffToken("futprep", { accountKey, role: account.role, pinHash });
}

export async function currentFutprepStaffAccount(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  const parts = readStaffToken(token);
  if (!parts || !isFutprepStaffRole(parts.role)) return null;

  const account = await accountByKey(parts.accountKey);
  if (!account) return null;

  // Our signature, this account as it is now, and no older than 12 hours.
  if (staffTokenValid("futprep", parts, { role: account.role, pinHash: account.pinHash })) return parts.accountKey;
  // The stored hash may have just changed on another server (a PIN change,
  // or the upgrade on sign-in) while this one's 30 s cache still holds the
  // old one: read it fresh once before refusing.
  invalidateAccountCache();
  const current = await accountByKey(parts.accountKey);
  return current && staffTokenValid("futprep", parts, { role: current.role, pinHash: current.pinHash }) ? parts.accountKey : null;
}

export async function currentFutprepStaffRole(): Promise<FutprepStaffRole | null> {
  const accountKey = await currentFutprepStaffAccount();
  if (!accountKey) return null;
  const account = await accountByKey(accountKey);
  return account?.role ?? null;
}

// The signed-in account's staff_members id: ties a coach's login to their
// coach profile, so a coach sees only their own pay (brief 13).
export async function currentFutprepStaffId(): Promise<number | null> {
  const accountKey = await currentFutprepStaffAccount();
  if (!accountKey) return null;
  const account = await accountByKey(accountKey);
  return account?.id ?? null;
}

// Real name for the signed-in account, for display/attribution (e.g. "who
// recorded this payment") instead of a hardcoded per-role label.
export async function currentFutprepStaffName(): Promise<string | null> {
  const accountKey = await currentFutprepStaffAccount();
  if (!accountKey) return null;
  const account = await accountByKey(accountKey);
  return account?.name ?? null;
}

// Brief 31 (A): whether the signed-in login may see a child's medical
// details (lib/futprepRoles.ts canSeeMedical). The switch is read from the
// database every time, not from the 30-second account cache, so turning it
// off takes effect at once on every server.
export async function currentFutprepStaffCanViewMedical(): Promise<boolean> {
  const accountKey = await currentFutprepStaffAccount();
  if (!accountKey) return false;
  const account = await accountByKey(accountKey);
  if (!account) return false;
  if (account.role === "ceo") return true;
  const { data, error } = await getSupabaseAdmin()
    .from("staff_members")
    .select("can_view_medical,active")
    .eq("organization_id", FUTPREP_ORG_ID)
    .eq("account_key", accountKey)
    .maybeSingle();
  if (error || !data?.active) return false;
  return canSeeMedical(account.role, Boolean(data.can_view_medical));
}

export function canManageFutprepTeam(role: FutprepStaffRole) {
  return role === "admin" || role === "ceo";
}

export async function requireFutprepStaff(
  allowed: FutprepStaffRole[],
  returnTo: string,
) {
  const role = await currentFutprepStaffRole();
  if (role && allowed.includes(role)) return role;
  redirect(`/futprep/staff/login?returnTo=${encodeURIComponent(returnTo)}`);
}

// Lets a signed-in staff account replace its PIN, without a database
// console. Requires the current PIN, so a signed-in session alone (e.g. a
// shared device) can't silently take over an account.
export async function changeFutprepPin(
  accountKey: string,
  currentPin: string,
  newPin: string,
): Promise<string | null> {
  const account = await accountByKey(accountKey);
  if (!account) return null;
  if (!(await verifyPin(currentPin, account.pinHash)).ok) return null;
  if (!PIN_PATTERN.test(newPin)) throw new Error("INVALID_PIN");

  if ((await verifyPin(newPin, account.pinHash)).ok) throw new Error("SAME_PIN");
  const newHash = await hashPin(newPin);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("staff_members")
    .update({ pin_hash: newHash, pin_changed_at: new Date().toISOString() })
    .eq("organization_id", FUTPREP_ORG_ID)
    .eq("account_key", accountKey);
  throwIfSupabaseError(error, "Could not update PIN");

  invalidateAccountCache();
  // The change has happened; a failed audit write is logged, not fatal.
  try {
    await logAudit({ organizationId: FUTPREP_ORG_ID, action: "staff.pin_changed", targetTable: "staff_members", targetId: account.id });
  } catch (auditError) {
    console.error("staff.pin_changed audit failed", auditError);
  }
  return makeStaffToken(accountKey, newPin);
}

// True once any account with credentials has ever been made, switched on
// or off. The staff login page shows a "create the first admin account"
// setup screen, which needs no sign-in, instead of the normal login form
// until this is true. Switched-off logins count, so switching every login
// off never opens that screen to a stranger again (audit finding 9).
export async function hasAnyStaffAccount(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", FUTPREP_ORG_ID)
    .not("account_key", "is", null)
    .not("pin_hash", "is", null);
  throwIfSupabaseError(error, "Could not check for an existing staff account");
  return Number(count ?? 0) > 0;
}

// One-time bootstrap: creates the very first admin account. Re-checks
// hasAnyStaffAccount() itself so this can't be used to create a second,
// rogue admin later once real accounts exist.
export async function createBootstrapAdmin(input: { name: string; accountKey: string; pin: string }) {
  if (await hasAnyStaffAccount()) throw new Error("ALREADY_BOOTSTRAPPED");
  return createStaffAccount({ ...input, role: "admin" });
}

export async function createStaffAccount(input: {
  name: string;
  accountKey: string;
  role: FutprepStaffRole;
  pin: string;
}): Promise<FutprepStaffAccountRecord> {
  const name = input.name.trim();
  const accountKey = input.accountKey.trim().toLowerCase();
  if (!name) throw new Error("NAME_REQUIRED");
  if (!ACCOUNT_KEY_PATTERN.test(accountKey)) throw new Error("INVALID_ACCOUNT_KEY");
  if (!isFutprepStaffRole(input.role)) throw new Error("INVALID_ROLE");
  if (!PIN_PATTERN.test(input.pin)) throw new Error("INVALID_PIN");

  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("staff_members")
    .select("id")
    .eq("account_key", accountKey)
    .maybeSingle();
  throwIfSupabaseError(existingError, "Could not check account name");
  if (existing) throw new Error("ACCOUNT_KEY_TAKEN");

  const pinHash = await hashPin(input.pin);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("staff_members")
    .insert({
      organization_id: FUTPREP_ORG_ID,
      name,
      role: input.role,
      account_key: accountKey,
      pin_hash: pinHash,
      responsibilities: "",
      active: true,
      created_at: now,
    })
    .select("id,name,role,account_key,active,pin_changed_at,email,can_view_medical,is_owner")
    .single();
  throwIfSupabaseError(error, "Could not create staff account");
  if (!data) throw new Error("Could not create staff account");

  invalidateAccountCache();
  return toAccountRecord(data);
}

function toAccountRecord(row: Record<string, unknown>): FutprepStaffAccountRecord {
  return {
    id: Number(row.id),
    name: row.name as string,
    accountKey: row.account_key as string,
    role: row.role as FutprepStaffRole,
    active: Boolean(row.active),
    pinChangedAt: (row.pin_changed_at as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    canViewMedical: Boolean(row.can_view_medical),
    isOwner: Boolean(row.is_owner),
  };
}

export async function listStaffAccounts(): Promise<FutprepStaffAccountRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff_members")
    .select("id,name,role,account_key,active,pin_changed_at,email,can_view_medical,is_owner")
    .eq("organization_id", FUTPREP_ORG_ID)
    .not("account_key", "is", null)
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load staff accounts");
  return (data ?? []).filter((row) => row.role && isFutprepStaffRole(row.role)).map(toAccountRecord);
}

// Active staff rows with no login yet (brief 31, A3), oldest first.
export async function listStaffWithoutLogin(): Promise<FutprepStaffWithoutLogin[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("staff_members")
    .select("id,name,role,email")
    .eq("organization_id", FUTPREP_ORG_ID)
    .eq("active", true)
    .is("account_key", null)
    .order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load staff without a login");
  return (data ?? []).map((row) => ({ id: Number(row.id), name: row.name as string, role: row.role as string, email: (row.email as string | null) ?? null }));
}

// Gives an existing staff row (one with no login) an account name, a role
// and a starting PIN, which they change after first sign-in (the same
// flow as a new account). Never touches a row that already has a login.
export async function assignStaffLogin(input: { id: number; accountKey: string; role: FutprepStaffRole; pin: string; actorName: string }): Promise<FutprepStaffAccountRecord> {
  const accountKey = input.accountKey.trim().toLowerCase();
  if (!ACCOUNT_KEY_PATTERN.test(accountKey)) throw new Error("INVALID_ACCOUNT_KEY");
  if (!isFutprepStaffRole(input.role)) throw new Error("INVALID_ROLE");
  if (!PIN_PATTERN.test(input.pin)) throw new Error("INVALID_PIN");
  const supabase = getSupabaseAdmin();
  const { data: taken, error: takenError } = await supabase.from("staff_members").select("id").eq("account_key", accountKey).maybeSingle();
  throwIfSupabaseError(takenError, "Could not check account name");
  if (taken) throw new Error("ACCOUNT_KEY_TAKEN");
  const { data, error } = await supabase
    .from("staff_members")
    // A new login starts without the medical view, whatever the row had.
    .update({ account_key: accountKey, role: input.role, pin_hash: await hashPin(input.pin), pin_changed_at: null, can_view_medical: false })
    .eq("id", input.id)
    .eq("organization_id", FUTPREP_ORG_ID)
    .eq("active", true)
    .is("account_key", null)
    .select("id,name,role,account_key,active,pin_changed_at,email,can_view_medical,is_owner")
    .maybeSingle();
  if (error?.code === "23505") throw new Error("ACCOUNT_KEY_TAKEN");
  throwIfSupabaseError(error, "Could not give the login");
  if (!data) throw new Error("ROW_NOT_FOUND");
  invalidateAccountCache();
  await logAudit({ organizationId: FUTPREP_ORG_ID, action: "staff.login_given", targetTable: "staff_members", targetId: input.id, after: { account_key: accountKey, role: input.role, by: input.actorName } });
  return toAccountRecord(data);
}

// Brief 31 (A): an admin login's medical view, switched by the owner.
// Who may see children's medical details must not change without a
// record, so a failed audit write fails the switch.
export async function setStaffCanViewMedical(id: number, canViewMedical: boolean, actorName: string) {
  const { error } = await getSupabaseAdmin()
    .from("staff_members")
    .update({ can_view_medical: canViewMedical })
    .eq("id", id)
    .eq("organization_id", FUTPREP_ORG_ID);
  throwIfSupabaseError(error, "Could not update staff account");
  invalidateAccountCache();
  await logAudit({ organizationId: FUTPREP_ORG_ID, action: "staff.medical_view_changed", targetTable: "staff_members", targetId: id, after: { can_view_medical: canViewMedical, by: actorName } });
}

// The email address reminders go to is set through
// db/futprepOwner.ts setFutprepStaffEmail (brief 31), which takes back any
// owner access given from the login in the same transaction.

export async function setStaffAccountActive(id: number, active: boolean) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("staff_members")
    .update({ active })
    .eq("id", id)
    .eq("organization_id", FUTPREP_ORG_ID);
  throwIfSupabaseError(error, "Could not update staff account");
  invalidateAccountCache();
}

export const FUTPREP_STAFF_COOKIE = COOKIE;
