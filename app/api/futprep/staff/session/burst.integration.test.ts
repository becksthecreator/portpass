import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPin } from "@/lib/pinHash";
import { POST } from "./route";

// Audit finding 6 (PR #198), against the local Supabase stack: twenty wrong
// PINs for one TEST account sent at the same moment, each from its own
// address. The lock must hold however many arrive together: at most five
// reach the PIN check (401), the rest are refused (429), and then even the
// right PIN waits. The PIN is drawn at random each run and never written
// anywhere but the request body. Wrong PINs feed the failed sign-ins alert,
// so nobody is set to receive it and no email can be sent (rule 4).
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = Date.now().toString(36);
const ACCOUNT = `test-delete-burst-${TAG}`;
const pin = String(randomInt(100000, 999999));
const wrongPin = String((Number(pin) + 1) % 1000000).padStart(6, "0");
const startedAt = new Date().toISOString();
let rowId = 0;

const signIn = (value: string) =>
  POST(new Request("http://localhost/api/futprep/staff/session", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${randomInt(1, 250)}.${randomInt(1, 250)}` }, body: JSON.stringify({ accountKey: ACCOUNT, pin: value }) }));

beforeAll(async () => {
  vi.stubEnv("PLATFORM_OWNER_EMAILS", "");
  vi.stubEnv("RESEND_API_KEY", "");
  const { data, error } = await db()
    .from("staff_members")
    .insert({ organization_id: 1, name: `TEST — delete ${TAG}`, role: "coach", account_key: ACCOUNT, pin_hash: await hashPin(pin), responsibilities: "", active: true })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed the TEST staff account: ${error.message}`);
  rowId = Number(data.id);
});

afterAll(async () => {
  await db().from("staff_login_attempts").delete().eq("account_key", ACCOUNT);
  // The wrong PINs that reach the check are also counted for the failed
  // sign-ins alert.
  await db().from("security_events").delete().eq("kind", "pin_failed").gte("created_at", startedAt);
  if (rowId) await db().from("staff_members").delete().eq("id", rowId);
  vi.unstubAllEnvs();
});

describe("a burst of wrong staff PINs sent at once", () => {
  it("gets at most five to the PIN check, and locks the account", async () => {
    const answers = await Promise.all(Array.from({ length: 20 }, () => signIn(wrongPin)));
    const statuses = answers.map((answer) => answer.status);
    expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(5);
    expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);

    const right = await signIn(pin);
    expect(right.status).toBe(429);
    expect(right.headers.get("set-cookie") ?? "").not.toContain("portpass_futprep_staff=");

    // Each wrong PIN that reached the check counts for the alert after its
    // answer has gone; wait for those writes so the cleanup finds them all.
    const reached = statuses.filter((status) => status === 401).length;
    await vi.waitFor(async () => {
      const { count } = await db().from("security_events").select("id", { count: "exact", head: true }).eq("kind", "pin_failed").gte("created_at", startedAt);
      expect(count ?? 0).toBeGreaterThanOrEqual(reached);
    }, { timeout: 5000, interval: 100 });
  });
});
