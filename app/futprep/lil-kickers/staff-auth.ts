import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/db/supabase";

export type FutprepStaffRole = "admin" | "coach" | "ceo";
export type FutprepStaffAccount = "admin" | "coach" | "ceo" | "kione" | "adon";

const COOKIE = "portpass_futprep_staff";
const FUTPREP_ORG_ID = 1;
const PIN_HASH_CACHE_TTL_MS = 30_000;

const ACCOUNT_ROLE: Record<FutprepStaffAccount, FutprepStaffRole> = {
  admin: "admin",
  coach: "coach",
  ceo: "ceo",
  kione: "coach",
  adon: "admin",
};

function isFutprepStaffAccount(value: string): value is FutprepStaffAccount {
  return value === "admin" || value === "coach" || value === "ceo" || value === "kione" || value === "adon";
}

function isFutprepStaffRole(value: string): value is FutprepStaffRole {
  return value === "admin" || value === "coach" || value === "ceo";
}

// PIN hashes live in Supabase (staff_members.account_key / pin_hash) rather
// than Vercel env vars, so staff PINs can be reset without a deploy. Cached
// briefly per server instance to avoid a DB round trip on every request.
let pinHashCache: { value: Partial<Record<FutprepStaffAccount, string>>; expires: number } | null = null;

async function loadPinHashes(): Promise<Partial<Record<FutprepStaffAccount, string>>> {
  if (pinHashCache && pinHashCache.expires > Date.now()) return pinHashCache.value;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff_members")
    .select("account_key, pin_hash")
    .eq("organization_id", FUTPREP_ORG_ID)
    .not("account_key", "is", null)
    .not("pin_hash", "is", null);

  throwIfSupabaseError(error, "Failed to load Futprep staff PINs");

  const map: Partial<Record<FutprepStaffAccount, string>> = {};
  for (const row of data ?? []) {
    const key = row.account_key as string | null;
    const hash = row.pin_hash as string | null;
    if (key && hash && isFutprepStaffAccount(key)) map[key] = hash;
  }

  pinHashCache = { value: map, expires: Date.now() + PIN_HASH_CACHE_TTL_MS };
  return map;
}

async function pinHashForAccount(account: FutprepStaffAccount): Promise<string> {
  const hashes = await loadPinHashes();
  return hashes[account] ?? "";
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function staffAccessConfigured(account: FutprepStaffAccount) {
  return Boolean(await pinHashForAccount(account));
}

export async function makeStaffToken(account: FutprepStaffAccount, pin: string) {
  const expectedHash = await pinHashForAccount(account);
  if (!expectedHash) return null;
  const submittedHash = await digest(pin);
  if (submittedHash !== expectedHash) return null;
  const role = ACCOUNT_ROLE[account];
  const signature = await digest(`portpass:futprep:${account}:${role}:${expectedHash}`);
  return `${account}.${role}.${signature}`;
}

export async function currentFutprepStaffAccount(): Promise<FutprepStaffAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [accountValue, roleValue, signature] = parts;
  if (!isFutprepStaffAccount(accountValue) || !isFutprepStaffRole(roleValue)) return null;
  const account = accountValue;
  const role = roleValue;
  if (ACCOUNT_ROLE[account] !== role) return null;

  const secret = await pinHashForAccount(account);
  if (!secret) return null;
  const expected = await digest(`portpass:futprep:${account}:${role}:${secret}`);
  return signature === expected ? account : null;
}

export function canManageFutprepTeam(account: FutprepStaffAccount) {
  return account === "ceo" || account === "adon";
}

export async function requireFutprepAccount(
  allowed: FutprepStaffAccount[],
  returnTo: string,
) {
  const account = await currentFutprepStaffAccount();
  if (account && allowed.includes(account)) return account;
  redirect(`/futprep/lil-kickers/staff/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function currentFutprepStaffRole(): Promise<FutprepStaffRole | null> {
  const account = await currentFutprepStaffAccount();
  return account ? ACCOUNT_ROLE[account] : null;
}

export async function requireFutprepStaff(
  allowed: FutprepStaffRole[],
  returnTo: string,
) {
  const role = await currentFutprepStaffRole();
  if (role && allowed.includes(role)) return role;
  redirect(`/futprep/lil-kickers/staff/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export const FUTPREP_STAFF_COOKIE = COOKIE;
