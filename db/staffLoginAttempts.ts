import { getSupabaseAdmin } from "./supabase";

// Wrong staff-PIN attempts, counted in the database so the limit holds
// across server instances: five misses on one account name lock that
// account's sign-in for 15 minutes. A correct PIN clears the count.
//
// The lock is per account name, not per visitor, so someone who knows a
// staff account name could keep it locked by guessing; that is the lesser
// harm next to an unlimited guess at a six-digit PIN, and an admin can
// still deactivate or rename an account.

export type StaffArea = "futprep" | "weddings";

export const STAFF_LOGIN_MAX_FAILURES = 5;
export const STAFF_LOGIN_WINDOW_MINUTES = 15;

// Only well-formed account names are ever counted or stored, so the table
// cannot be filled with arbitrary text.
const ACCOUNT_KEY_PATTERN = /^[a-z0-9_-]{3,40}$/;

export function isCountableAccountKey(accountKey: string): boolean {
  return ACCOUNT_KEY_PATTERN.test(accountKey);
}

function windowStart(now: Date): string {
  return new Date(now.getTime() - STAFF_LOGIN_WINDOW_MINUTES * 60 * 1000).toISOString();
}

// True when this account has used up its wrong attempts. Fails open: if the
// count cannot be read, sign-in still works (the PIN check itself is
// unaffected) and the error is logged.
export async function staffLoginLocked(area: StaffArea, accountKey: string, now: Date = new Date()): Promise<boolean> {
  if (!isCountableAccountKey(accountKey)) return false;
  const { count, error } = await getSupabaseAdmin()
    .from("staff_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("area", area)
    .eq("account_key", accountKey)
    .gte("created_at", windowStart(now));
  if (error) {
    console.error("staff login attempts read", error.message);
    return false;
  }
  return (count ?? 0) >= STAFF_LOGIN_MAX_FAILURES;
}

export async function recordStaffLoginFailure(area: StaffArea, accountKey: string, now: Date = new Date()): Promise<void> {
  if (!isCountableAccountKey(accountKey)) return;
  const db = getSupabaseAdmin();
  const { error } = await db.from("staff_login_attempts").insert({ area, account_key: accountKey, created_at: now.toISOString() });
  if (error) console.error("staff login attempts write", error.message);
  // Housekeeping: nothing older than a day is needed.
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await db.from("staff_login_attempts").delete().lt("created_at", dayAgo);
}

export async function clearStaffLoginFailures(area: StaffArea, accountKey: string): Promise<void> {
  if (!isCountableAccountKey(accountKey)) return;
  const { error } = await getSupabaseAdmin().from("staff_login_attempts").delete().eq("area", area).eq("account_key", accountKey);
  if (error) console.error("staff login attempts clear", error.message);
}
