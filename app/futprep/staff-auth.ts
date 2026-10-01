import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logAudit } from "@/db/audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/db/supabase";
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
};

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

type CachedAccount = { id: number; name: string; role: FutprepStaffRole; pinHash: string; active: boolean };

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
    .select("id, name, role, account_key, pin_hash, active")
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
      map.set(key, { id: Number(row.id), name: row.name as string, role, pinHash: hash, active: Boolean(row.active) });
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

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function makeStaffToken(accountKey: string, pin: string) {
  const account = await accountByKey(accountKey);
  if (!account) return null;
  const submittedHash = await digest(pin);
  if (submittedHash !== account.pinHash) return null;
  // Signed with a server secret and dated (lib/staffSession.ts).
  return issueStaffToken("futprep", { accountKey, role: account.role, pinHash: account.pinHash });
}

export async function currentFutprepStaffAccount(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  const parts = readStaffToken(token);
  if (!parts || !isFutprepStaffRole(parts.role)) return null;

  const account = await accountByKey(parts.accountKey);
  if (!account) return null;

  // Our signature, this account as it is now, and no older than 12 hours.
  return staffTokenValid("futprep", parts, { role: account.role, pinHash: account.pinHash }) ? parts.accountKey : null;
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
  if ((await digest(currentPin)) !== account.pinHash) return null;
  if (!PIN_PATTERN.test(newPin)) throw new Error("INVALID_PIN");

  const newHash = await digest(newPin);
  if (newHash === account.pinHash) throw new Error("SAME_PIN");
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

// True once at least one active account with credentials exists. The staff
// login page shows a "create the first admin account" setup screen instead
// of the normal login form until this is true.
export async function hasAnyStaffAccount(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", FUTPREP_ORG_ID)
    .eq("active", true)
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

  const pinHash = await digest(input.pin);
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
    .select("id,name,role,account_key,active,pin_changed_at,email")
    .single();
  throwIfSupabaseError(error, "Could not create staff account");
  if (!data) throw new Error("Could not create staff account");

  invalidateAccountCache();
  return { id: Number(data.id), name: data.name, accountKey: data.account_key, role: data.role as FutprepStaffRole, active: Boolean(data.active), pinChangedAt: (data.pin_changed_at as string | null) ?? null, email: (data.email as string | null) ?? null };
}

export async function listStaffAccounts(): Promise<FutprepStaffAccountRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff_members")
    .select("id,name,role,account_key,active,pin_changed_at,email")
    .eq("organization_id", FUTPREP_ORG_ID)
    .not("account_key", "is", null)
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load staff accounts");
  return (data ?? [])
    .filter((row) => row.role && isFutprepStaffRole(row.role))
    .map((row) => ({ id: Number(row.id), name: row.name, accountKey: row.account_key as string, role: row.role as FutprepStaffRole, active: Boolean(row.active), pinChangedAt: (row.pin_changed_at as string | null) ?? null, email: (row.email as string | null) ?? null }));
}

// The email address reminders go to. null clears it.
export async function setStaffAccountEmail(id: number, email: string | null) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("staff_members")
    .update({ email })
    .eq("id", id)
    .eq("organization_id", FUTPREP_ORG_ID);
  throwIfSupabaseError(error, "Could not update staff account");
}

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
