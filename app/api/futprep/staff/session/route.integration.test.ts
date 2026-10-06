import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";

// Brief 24, part D, against the local Supabase stack: a TEST staff account
// stored with the old unsalted hash signs in once with the right PIN, and
// from then on its row holds the new salted scrypt form; the new form
// signs in too, a wrong PIN still does not, and the lockout from Brief 21
// part C is untouched. The PIN is drawn at random each run and never
// written anywhere but the request body.
const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = Date.now().toString(36);
const ACCOUNT = `test-delete-pin-${TAG}`;
const pin = String(randomInt(100000, 999999));
const wrongPin = String((Number(pin) + 1) % 1000000).padStart(6, "0");
let rowId = 0;

const signIn = (accountKey: string, value: string) =>
  POST(new Request("http://localhost/api/futprep/staff/session", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.${randomInt(1, 250)}.${randomInt(1, 250)}` }, body: JSON.stringify({ accountKey, pin: value }) }));

const storedHash = async () => String((await db().from("staff_members").select("pin_hash").eq("id", rowId).single()).data?.pin_hash ?? "");

beforeAll(async () => {
  const { data, error } = await db()
    .from("staff_members")
    .insert({ organization_id: 1, name: `TEST — delete ${TAG}`, role: "coach", account_key: ACCOUNT, pin_hash: createHash("sha256").update(pin).digest("hex"), responsibilities: "", active: true })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed the TEST staff account: ${error.message}`);
  rowId = Number(data.id);
});

afterAll(async () => {
  await db().from("staff_login_attempts").delete().eq("account_key", ACCOUNT);
  if (rowId) await db().from("staff_members").delete().eq("id", rowId);
});

describe("a staff PIN stored the old way", () => {
  it("signs in once, and is stored the new way from then on", async () => {
    expect(await storedHash()).toMatch(/^[0-9a-f]{64}$/);
    const first = await signIn(ACCOUNT, pin);
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toContain("portpass_futprep_staff=");
    const upgraded = await storedHash();
    expect(upgraded.startsWith("scrypt$")).toBe(true);
    expect(upgraded).not.toMatch(/^[0-9a-f]{64}$/);

    const again = await signIn(ACCOUNT, pin);
    expect(again.status).toBe(200);
    expect(await storedHash()).toBe(upgraded);
  });

  it("still refuses a wrong PIN, and counts it towards the lockout", async () => {
    const refused = await signIn(ACCOUNT, wrongPin);
    expect(refused.status).toBe(401);
    const { count } = await db().from("staff_login_attempts").select("id", { count: "exact", head: true }).eq("account_key", ACCOUNT);
    expect(Number(count ?? 0)).toBeGreaterThanOrEqual(1);
    expect(await storedHash()).toMatch(/^scrypt\$/);
  });
});
