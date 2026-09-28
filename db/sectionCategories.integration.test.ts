import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listBusinessCategorySlugs, setBusinessExtraCategories } from "./business";
import { listSectionBusinesses, liveCountsByCategory } from "./organizations";

// One listing, several categories (round 5, §1): a photographer sits under
// Weddings → Photo & Video and Services → Photo & Video as the same row.
// The primary category is mirrored into organization_categories by a
// trigger; extras are set explicitly; every section read goes through the
// one table.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const slug = `test-delete-lens-${Date.now()}`;
let orgId = 0;

const listed = async (section: string, subcategory?: string) => (await listSectionBusinesses(section, subcategory)).filter((b) => b.slug === slug);

beforeAll(async () => {
  const { data, error } = await admin
    .from("organizations")
    .insert({ name: "TEST — delete Lens & Light", slug, primary_category: "weddings", subcategory: "photo-video", status: "approved" })
    .select("id")
    .single();
  expect(error).toBeNull();
  orgId = Number(data!.id);
});

afterAll(async () => {
  if (orgId) {
    await admin.from("audit_log").delete().eq("organization_id", orgId);
    await admin.from("offerings").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    expect(error).toBeNull();
  }
});

describe("organization categories", () => {
  it("mirrors the primary category, so the section and subcategory pages list it", async () => {
    expect(await listBusinessCategorySlugs(orgId)).toEqual(["photo-video"]);
    expect(await listed("weddings")).toHaveLength(1);
    expect(await listed("weddings", "photo-video")).toHaveLength(1);
    expect(await listed("weddings", "planning")).toHaveLength(0);
    expect(await listed("services")).toHaveLength(0);
  });

  it("lists one business under a second section without a second row", async () => {
    await setBusinessExtraCategories(orgId, ["photography"], null);
    expect(await listBusinessCategorySlugs(orgId)).toEqual(["photo-video", "photography"]);
    expect(await listed("services")).toHaveLength(1);
    expect(await listed("services", "photography")).toHaveLength(1);
    expect(await listed("services", "phone-tech-repair")).toHaveLength(0);
    expect(await listed("weddings", "photo-video")).toHaveLength(1);
  });

  it("moves the mirror when the primary changes and keeps the extras", async () => {
    const { error } = await admin.from("organizations").update({ subcategory: "planning" }).eq("id", orgId);
    expect(error).toBeNull();
    expect(await listBusinessCategorySlugs(orgId)).toEqual(["photography", "planning"]);
    expect(await listed("weddings", "photo-video")).toHaveLength(0);
    expect(await listed("weddings", "planning")).toHaveLength(1);
    expect(await listed("services", "photography")).toHaveLength(1);
  });

  it("refuses a category that doesn't exist", async () => {
    await expect(setBusinessExtraCategories(orgId, ["crypto"], null)).rejects.toThrow(/UNKNOWN_CATEGORY/);
    expect(await listBusinessCategorySlugs(orgId)).toEqual(["photography", "planning"]);
  });

  it("counts a published business once per section, however many categories it has", async () => {
    const before = await liveCountsByCategory({ maxAgeMs: 0 });
    await setBusinessExtraCategories(orgId, ["photography", "officiants"], null);
    const { error: offeringError } = await admin.from("offerings").insert({ organization_id: orgId, type: "service", slug: "portraits", name: "Portrait session", price_cents: 25000, price_unit: "from", is_published: true });
    expect(offeringError).toBeNull();
    const { error: publishError } = await admin.from("organizations").update({ is_published: true, status: "live" }).eq("id", orgId);
    expect(publishError).toBeNull();

    const after = await liveCountsByCategory({ maxAgeMs: 0 });
    const delta = (key: string) => (after.get(key) ?? 0) - (before.get(key) ?? 0);
    expect(delta("weddings")).toBe(1);
    expect(delta("planning")).toBe(1);
    expect(delta("officiants")).toBe(1);
    expect(delta("services")).toBe(1);
    expect(delta("photography")).toBe(1);
    expect(delta("photo-video")).toBe(0);
    expect(delta("sports-fitness")).toBe(0);
  });
});
