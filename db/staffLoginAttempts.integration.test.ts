import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { clearStaffLoginFailures, recordStaffLoginFailure, staffLoginLocked } from "./staffLoginAttempts";

// The wrong-PIN counter against CI's local Supabase stack: five misses in
// 15 minutes lock one account name in one staff area; older misses don't
// count; a clear unlocks it; nothing but well-formed account names is stored.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const KEY = `test-delete-${crypto.randomUUID().slice(0, 8)}`;
const OTHER = `test-delete-${crypto.randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await db().from("staff_login_attempts").delete().in("account_key", [KEY, OTHER]);
});

describe("staff PIN lockout", () => {
  it("locks an account name after five wrong PINs, in that staff area only", async () => {
    for (let i = 0; i < 4; i += 1) await recordStaffLoginFailure("futprep", KEY);
    expect(await staffLoginLocked("futprep", KEY)).toBe(false);
    await recordStaffLoginFailure("futprep", KEY);
    expect(await staffLoginLocked("futprep", KEY)).toBe(true);
    expect(await staffLoginLocked("weddings", KEY)).toBe(false);
    expect(await staffLoginLocked("futprep", OTHER)).toBe(false);
  });

  it("unlocks when the count is cleared", async () => {
    await clearStaffLoginFailures("futprep", KEY);
    expect(await staffLoginLocked("futprep", KEY)).toBe(false);
  });

  it("forgets misses older than 15 minutes", async () => {
    const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
    for (let i = 0; i < 5; i += 1) await recordStaffLoginFailure("futprep", OTHER, sixteenMinutesAgo);
    expect(await staffLoginLocked("futprep", OTHER)).toBe(false);
    await recordStaffLoginFailure("futprep", OTHER);
    expect(await staffLoginLocked("futprep", OTHER)).toBe(false);
  });

  it("never stores anything that isn't a well-formed account name", async () => {
    const junk = "x".repeat(500);
    await recordStaffLoginFailure("futprep", junk);
    await recordStaffLoginFailure("futprep", "Robert'); drop table registrations;--");
    const { count } = await db().from("staff_login_attempts").select("id", { count: "exact", head: true }).in("account_key", [junk, "Robert'); drop table registrations;--"]);
    expect(count).toBe(0);
    expect(await staffLoginLocked("futprep", junk)).toBe(false);
  });

  it("cannot be read or written by the browser roles", async () => {
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!anonKey) return;
    const anon = createClient(process.env.SUPABASE_URL!, anonKey);
    const { data } = await anon.from("staff_login_attempts").select("id").limit(1);
    expect(data ?? []).toEqual([]);
    const { error } = await anon.from("staff_login_attempts").insert({ area: "futprep", account_key: KEY });
    expect(error).not.toBeNull();
  });
});
