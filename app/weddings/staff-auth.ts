import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/db/supabase";

// Mirrors app/futprep/staff-auth.ts exactly (see that file for the fuller
// commentary on the design). Two differences: roles are Wedding Desk /
// Antonio instead of Futprep's four, and the organization id is looked up
// by slug at runtime rather than hardcoded, since it isn't guaranteed to be
// a fixed number the way Futprep's (created first) happens to be.
export type WeddingStaffRole = "wedding_desk" | "antonio";
export const WEDDING_STAFF_ROLES: WeddingStaffRole[] = ["wedding_desk", "antonio"];

export type WeddingStaffAccountRecord = {
  id: number;
  name: string;
  accountKey: string;
  role: WeddingStaffRole;
  active: boolean;
};

const COOKIE = "portpass_wedding_staff";
const ORG_SLUG = "bahamas-weddings";
const ACCOUNT_CACHE_TTL_MS = 30_000;
const ACCOUNT_KEY_PATTERN = /^[a-z0-9_-]{3,40}$/;

function isWeddingStaffRole(value: string): value is WeddingStaffRole {
  return (WEDDING_STAFF_ROLES as string[]).includes(value);
}

let orgIdCache: number | null = null;
async function weddingOrgId(): Promise<number> {
  if (orgIdCache !== null) return orgIdCache;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
  throwIfSupabaseError(error, "Could not load the wedding organization");
  if (!data) throw new Error("WEDDING_ORG_NOT_FOUND");
  orgIdCache = Number(data.id);
  return orgIdCache;
}

type CachedAccount = { id: number; name: string; role: WeddingStaffRole; pinHash: string; active: boolean };

let accountCache: { value: Map<string, CachedAccount>; expires: number } | null = null;

async function loadAccounts(): Promise<Map<string, CachedAccount>> {
  if (accountCache && accountCache.expires > Date.now()) return accountCache.value;

  const supabase = getSupabaseAdmin();
  const orgId = await weddingOrgId();
  const { data, error } = await supabase
    .from("staff_members")
    .select("id, name, role, account_key, pin_hash, active")
    .eq("organization_id", orgId)
    .not("account_key", "is", null)
    .not("pin_hash", "is", null);

  throwIfSupabaseError(error, "Failed to load wedding staff accounts");

  const map = new Map<string, CachedAccount>();
  for (const row of data ?? []) {
    const key = row.account_key as string | null;
    const role = row.role as string | null;
    const hash = row.pin_hash as string | null;
    if (key && hash && role && isWeddingStaffRole(role)) {
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

export async function makeWeddingStaffToken(accountKey: string, pin: string) {
  const account = await accountByKey(accountKey);
  if (!account) return null;
  const submittedHash = await digest(pin);
  if (submittedHash !== account.pinHash) return null;
  const signature = await digest(`portpass:weddings:${accountKey}:${account.role}:${account.pinHash}`);
  return `${accountKey}.${account.role}.${signature}`;
}

export async function currentWeddingStaffAccount(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [accountKey, roleValue, signature] = parts;
  if (!isWeddingStaffRole(roleValue)) return null;

  const account = await accountByKey(accountKey);
  if (!account || account.role !== roleValue) return null;

  const expected = await digest(`portpass:weddings:${accountKey}:${account.role}:${account.pinHash}`);
  return signature === expected ? accountKey : null;
}

export async function currentWeddingStaffRole(): Promise<WeddingStaffRole | null> {
  const accountKey = await currentWeddingStaffAccount();
  if (!accountKey) return null;
  const account = await accountByKey(accountKey);
  return account?.role ?? null;
}

export async function currentWeddingStaffName(): Promise<string | null> {
  const accountKey = await currentWeddingStaffAccount();
  if (!accountKey) return null;
  const account = await accountByKey(accountKey);
  return account?.name ?? null;
}

export async function currentWeddingStaffId(): Promise<number | null> {
  const accountKey = await currentWeddingStaffAccount();
  if (!accountKey) return null;
  const account = await accountByKey(accountKey);
  return account?.id ?? null;
}

export async function requireWeddingStaff(
  allowed: WeddingStaffRole[],
  returnTo: string,
) {
  const role = await currentWeddingStaffRole();
  if (role && allowed.includes(role)) return role;
  redirect(`/weddings/staff/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function changeWeddingPin(
  accountKey: string,
  currentPin: string,
  newPin: string,
): Promise<string | null> {
  const account = await accountByKey(accountKey);
  if (!account) return null;
  if ((await digest(currentPin)) !== account.pinHash) return null;
  if (!/^\d{4,}$/.test(newPin)) throw new Error("INVALID_PIN");

  const newHash = await digest(newPin);
  const supabase = getSupabaseAdmin();
  const orgId = await weddingOrgId();
  const { error } = await supabase
    .from("staff_members")
    .update({ pin_hash: newHash })
    .eq("organization_id", orgId)
    .eq("account_key", accountKey);
  throwIfSupabaseError(error, "Could not update PIN");

  invalidateAccountCache();
  return makeWeddingStaffToken(accountKey, newPin);
}

export async function hasAnyWeddingStaffAccount(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const orgId = await weddingOrgId();
  const { count, error } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("active", true)
    .not("account_key", "is", null)
    .not("pin_hash", "is", null);
  throwIfSupabaseError(error, "Could not check for an existing wedding staff account");
  return Number(count ?? 0) > 0;
}

export async function createBootstrapWeddingAdmin(input: { name: string; accountKey: string; pin: string }) {
  if (await hasAnyWeddingStaffAccount()) throw new Error("ALREADY_BOOTSTRAPPED");
  return createWeddingStaffAccount({ ...input, role: "antonio" });
}

export async function createWeddingStaffAccount(input: {
  name: string;
  accountKey: string;
  role: WeddingStaffRole;
  pin: string;
}): Promise<WeddingStaffAccountRecord> {
  const name = input.name.trim();
  const accountKey = input.accountKey.trim().toLowerCase();
  if (!name) throw new Error("NAME_REQUIRED");
  if (!ACCOUNT_KEY_PATTERN.test(accountKey)) throw new Error("INVALID_ACCOUNT_KEY");
  if (!isWeddingStaffRole(input.role)) throw new Error("INVALID_ROLE");
  if (!/^\d{4,}$/.test(input.pin)) throw new Error("INVALID_PIN");

  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("staff_members")
    .select("id")
    .eq("account_key", accountKey)
    .maybeSingle();
  throwIfSupabaseError(existingError, "Could not check account name");
  if (existing) throw new Error("ACCOUNT_KEY_TAKEN");

  const pinHash = await digest(input.pin);
  const orgId = await weddingOrgId();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("staff_members")
    .insert({
      organization_id: orgId,
      name,
      role: input.role,
      account_key: accountKey,
      pin_hash: pinHash,
      responsibilities: "",
      active: true,
      created_at: now,
    })
    .select("id,name,role,account_key,active")
    .single();
  throwIfSupabaseError(error, "Could not create wedding staff account");
  if (!data) throw new Error("Could not create wedding staff account");

  invalidateAccountCache();
  return { id: Number(data.id), name: data.name, accountKey: data.account_key, role: data.role as WeddingStaffRole, active: Boolean(data.active) };
}

export async function listWeddingStaffAccounts(): Promise<WeddingStaffAccountRecord[]> {
  const supabase = getSupabaseAdmin();
  const orgId = await weddingOrgId();
  const { data, error } = await supabase
    .from("staff_members")
    .select("id,name,role,account_key,active")
    .eq("organization_id", orgId)
    .not("account_key", "is", null)
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  throwIfSupabaseError(error, "Could not load wedding staff accounts");
  return (data ?? [])
    .filter((row) => row.role && isWeddingStaffRole(row.role))
    .map((row) => ({ id: Number(row.id), name: row.name, accountKey: row.account_key as string, role: row.role as WeddingStaffRole, active: Boolean(row.active) }));
}

export async function setWeddingStaffAccountActive(id: number, active: boolean) {
  const supabase = getSupabaseAdmin();
  const orgId = await weddingOrgId();
  const { error } = await supabase
    .from("staff_members")
    .update({ active })
    .eq("id", id)
    .eq("organization_id", orgId);
  throwIfSupabaseError(error, "Could not update wedding staff account");
  invalidateAccountCache();
}

export const WEDDING_STAFF_COOKIE = COOKIE;
