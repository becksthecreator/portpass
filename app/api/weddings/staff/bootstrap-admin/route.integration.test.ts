import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasAnyWeddingStaffAccount } from "@/app/weddings/staff-auth";
import { hashPin } from "@/lib/pinHash";
import { POST } from "./route";

// Audit finding 9 (PR #198), the Wedding Desk's copy: its "create the first
// account" door needs no sign-in, so it must stay shut once any Wedding
// Desk login has ever been made, even with every login switched off. Every
// login switched on in the wedding organisation is switched off for this
// file and those exact rows switched back on after; the TEST rows are
// deleted. PINs are drawn at random and never written anywhere but a body.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = Date.now().toString(36);
const OLD_LOGIN = `test-delete-old-${TAG}`;
const NEW_ADMIN = `test-delete-boot-${TAG}`;
let switchedOff: number[] = [];

beforeAll(async () => {
  const { data: org, error: orgError } = await db().from("organizations").select("id").eq("slug", "bahamas-weddings").single();
  if (orgError || !org) throw new Error(`the wedding organisation is missing: ${orgError?.message ?? "no row"}`);
  const orgId = Number(org.id);
  const { data: on, error: onError } = await db()
    .from("staff_members")
    .update({ active: false })
    .eq("organization_id", orgId)
    .eq("active", true)
    .not("account_key", "is", null)
    .not("pin_hash", "is", null)
    .select("id");
  if (onError) throw new Error(`could not switch the logins off: ${onError.message}`);
  switchedOff = (on ?? []).map((row) => Number(row.id));
  const { error } = await db()
    .from("staff_members")
    .insert({ organization_id: orgId, name: `TEST — delete ${TAG}`, role: "wedding_desk", account_key: OLD_LOGIN, pin_hash: await hashPin(String(randomInt(100000, 999999))), responsibilities: "", active: false });
  if (error) throw new Error(`could not seed the TEST login: ${error.message}`);
});

afterAll(async () => {
  await db().from("staff_members").delete().in("account_key", [OLD_LOGIN, NEW_ADMIN]);
  if (switchedOff.length > 0) await db().from("staff_members").update({ active: true }).in("id", switchedOff);
});

describe("the Wedding Desk first-account door, with every login switched off", () => {
  it("still counts the login that was made", async () => {
    expect(await hasAnyWeddingStaffAccount()).toBe(true);
  });

  it("refuses to make a new account, and makes no row", async () => {
    const answer = await POST(new Request("http://localhost/api/weddings/staff/bootstrap-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: `TEST — delete ${TAG}`, accountKey: NEW_ADMIN, pin: String(randomInt(100000, 999999)) }) }));
    expect(answer.status).toBe(409);
    expect((await answer.json()).error).toMatch(/already exists/);
    expect(answer.headers.get("set-cookie") ?? "").not.toContain("portpass_wedding_staff=");
    const { count } = await db().from("staff_members").select("id", { count: "exact", head: true }).eq("account_key", NEW_ADMIN);
    expect(count).toBe(0);
  });
});
