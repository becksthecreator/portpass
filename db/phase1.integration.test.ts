import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { phase1Checks, SCOUT_SETTINGS } from "@/lib/phase1";
import { getSignInCodeUsedAt, saveSignInCodeUsed } from "./adminHealth";
import { loadPhase1Facts } from "./phase1";

// Admin -> Phase 1 (brief 19, part F) against CI's local Supabase stack:
// the facts are read from real rows, a setting's value never reaches the
// result, and the time an emailed sign-in code was last used is kept as a
// time and nothing else. Every row is "TEST — delete" and removed.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let orgId = 0;
let previousSignIn: unknown = undefined;

beforeAll(async () => {
  const { data: kept } = await db.from("site_content").select("value").eq("key", "sign_in_code_used").maybeSingle();
  previousSignIn = kept?.value;
  const { data: org, error } = await db.from("organizations").insert({ name: `TEST delete ${TAG} Phase`, slug: `test-delete-phase-${TAG}`, primary_category: "entertainment", status: "approved", one_liner: "TEST — delete." }).select("id").single();
  if (error || !org) throw new Error(`Could not seed the TEST business: ${error?.message}`);
  orgId = Number(org.id);
  const perk = await db.from("member_perks").insert({ organization_id: orgId, title: "TEST delete phase perk", kind: "priority", status: "live", published_at: new Date().toISOString() });
  if (perk.error) throw new Error(`Could not seed the TEST perk: ${perk.error.message}`);
});

afterAll(async () => {
  if (previousSignIn === undefined) await db.from("site_content").delete().eq("key", "sign_in_code_used");
  else await db.from("site_content").update({ value: previousSignIn }).eq("key", "sign_in_code_used");
  if (orgId) {
    await db.from("member_perks").delete().eq("organization_id", orgId);
    await db.from("audit_log").delete().eq("organization_id", orgId);
    const { error } = await db.from("organizations").delete().eq("id", orgId);
    expect(error).toBeNull();
  }
});

describe("the facts Admin -> Phase 1 reads", () => {
  it("reads each one from the database", async () => {
    const facts = await loadPhase1Facts({});
    expect(facts.businesses?.some((business) => business.organizationId === orgId && business.items.length === 9)).toBe(true);
    expect(facts.livePerks).toBeGreaterThanOrEqual(1);
    expect(typeof facts.publishedGuides).toBe("number");
    // Readable, whether or not there is one yet.
    expect(facts.backup).not.toBeUndefined();
    expect(facts.carv).not.toBeUndefined();
    expect(facts.demoResetAt).not.toBeUndefined();
    const checks = phase1Checks(facts, new Date());
    expect(checks.some((check) => check.detail.startsWith("Could not be read"))).toBe(false);
  });

  it("reports settings as set or not set by name, and never their values", async () => {
    const env = { CRON_SECRET: `cron-${TAG}-value`, ANTHROPIC_API_KEY: `key-${TAG}-value`, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
    const facts = await loadPhase1Facts(env);
    expect(facts.settings).toEqual({ CRON_SECRET: true, GOOGLE_PLACES_API_KEY: false, INSTAGRAM_BUSINESS_ACCOUNT_ID: false, INSTAGRAM_GRAPH_ACCESS_TOKEN: false, ANTHROPIC_API_KEY: true });
    expect(Object.keys(facts.settings).sort()).toEqual(["CRON_SECRET", ...SCOUT_SETTINGS].sort());
    const shown = JSON.stringify({ facts, checks: phase1Checks(facts, new Date()) });
    expect(shown).not.toContain(`cron-${TAG}-value`);
    expect(shown).not.toContain(`key-${TAG}-value`);
    expect(shown).not.toContain(String(process.env.SUPABASE_SECRET_KEY));
  });
});

describe("when an emailed sign-in code was last used", () => {
  it("keeps the time, and only the time", async () => {
    const at = new Date("2026-10-05T12:34:56.000Z");
    await saveSignInCodeUsed(at);
    expect(await getSignInCodeUsedAt()).toBe(at.toISOString());
    const { data } = await db.from("site_content").select("value").eq("key", "sign_in_code_used").single();
    expect(data!.value).toEqual({ at: at.toISOString() });
    // A later sign-in replaces it.
    const later = new Date("2026-10-05T13:00:00.000Z");
    await saveSignInCodeUsed(later);
    expect(await getSignInCodeUsedAt()).toBe(later.toISOString());
    expect((await loadPhase1Facts({})).signInCodeUsedAt).toBe(later.toISOString());
  });
});
