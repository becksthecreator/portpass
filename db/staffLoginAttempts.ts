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

// Wrong attempts on this account in the window. Fails open: if the count
// cannot be read, it is 0, sign-in still works (the PIN check itself is
// unaffected) and the error is logged.
async function countAttempts(area: StaffArea, accountKey: string, now: Date): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("staff_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("area", area)
    .eq("account_key", accountKey)
    .gte("created_at", windowStart(now));
  if (error) {
    console.error("staff login attempts read", error.message);
    return 0;
  }
  return count ?? 0;
}

// True when this account has used up its wrong attempts.
export async function staffLoginLocked(area: StaffArea, accountKey: string, now: Date = new Date()): Promise<boolean> {
  if (!isCountableAccountKey(accountKey)) return false;
  return (await countAttempts(area, accountKey, now)) >= STAFF_LOGIN_MAX_FAILURES;
}

// Records one attempt and returns the count with it included. The count is
// read after the write, so attempts recorded at the same moment each see
// every one written before them: of any number sent together, no more than
// five can read five or fewer (audit finding 6). 0 for a name that is never
// counted.
export async function recordStaffLoginFailure(area: StaffArea, accountKey: string, now: Date = new Date()): Promise<number> {
  if (!isCountableAccountKey(accountKey)) return 0;
  const db = getSupabaseAdmin();
  const { error } = await db.from("staff_login_attempts").insert({ area, account_key: accountKey, created_at: now.toISOString() });
  if (error) console.error("staff login attempts write", error.message);
  const count = await countAttempts(area, accountKey, now);
  // Housekeeping: nothing older than a day is needed.
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await db.from("staff_login_attempts").delete().lt("created_at", dayAgo);
  return count;
}

export async function clearStaffLoginFailures(area: StaffArea, accountKey: string): Promise<void> {
  if (!isCountableAccountKey(accountKey)) return;
  const { error } = await getSupabaseAdmin().from("staff_login_attempts").delete().eq("area", area).eq("account_key", accountKey);
  if (error) console.error("staff login attempts clear", error.message);
}
