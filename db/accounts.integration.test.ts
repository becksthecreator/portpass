import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { listCategoryOrganizations } from "./organizations";
import { listSections, invalidateCategoryCache } from "./categories";

// Runs against the local Supabase stack from .github/workflows/ci.yml, with
// every migration applied by `supabase start`. Proves three things about
// the accounts schema migrations: the seed landed, the browser roles are
// locked out of the new tables, and drafts stay off category pages.
const url = process.env.SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(url, secret);
const TEST_SLUG = `test-delete-b1-${crypto.randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await admin.from("organizations").delete().eq("slug", TEST_SLUG);
});

describe("categories seed", () => {
  it("has the six sections with Events under Entertainment, not top-level", async () => {
    invalidateCategoryCache();
    const sections = await listSections({ includeHidden: true });
    expect(sections.map((s) => s.slug)).toEqual(["sports-fitness", "weddings", "venues", "tours", "entertainment", "services"]);
    const entertainment = sections.find((s) => s.slug === "entertainment")!;
    expect(entertainment.subcategories.map((c) => c.slug)).toEqual(["events", "djs", "sound-equipment", "party-rentals", "photo-booths"]);
    // Nine visible plus the three hidden in round 5 (Equestrian, Padel,
    // Volleyball) -- hidden rows are kept, not deleted.
    expect(sections.find((s) => s.slug === "sports-fitness")!.subcategories.length).toBe(12);
  });
});

describe("RLS on the new tables", () => {
  const tables = ["profiles", "organization_members", "organization_invites", "audit_log", "people", "guardianships", "categories"];

  it.skipIf(!anonKey)("gives the anon key nothing from any of them", async () => {
    const anon = createClient(url, anonKey!);
    for (const table of tables) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // Grants are revoked, so this is a permission error rather than an
      // empty result -- either way nothing comes back.
      expect(error !== null || (data ?? []).length === 0, `anon must get nothing from ${table}`).toBe(true);
    }
  });

  it("still lets the service role read them (sanity check the test isn't vacuous)", async () => {
    const { error } = await admin.from("categories").select("id").limit(1);
    expect(error).toBeNull();
  });
});

describe("listCategoryOrganizations and status", () => {
  it("hides a draft business and shows it once approved", async () => {
    const { error: insertError } = await admin.from("organizations").insert({
      name: "TEST — delete B1",
      slug: TEST_SLUG,
      primary_category: "sports-fitness",
      status: "draft",
    });
    expect(insertError).toBeNull();

    const beforeApproval = await listCategoryOrganizations("sports-fitness");
    expect(beforeApproval.some((o) => o.slug === TEST_SLUG)).toBe(false);

    const { error: updateError } = await admin.from("organizations").update({ status: "approved" }).eq("slug", TEST_SLUG);
    expect(updateError).toBeNull();

    const afterApproval = await listCategoryOrganizations("sports-fitness");
    const entry = afterApproval.find((o) => o.slug === TEST_SLUG);
    expect(entry).toBeDefined();
    expect(entry!.isPublished).toBe(false);
  });

  it("drops status back to approved when a live business is unpublished", async () => {
    const { data: row } = await admin.from("organizations").select("id").eq("slug", TEST_SLUG).single();
    expect(row).toBeTruthy();
    const orgId = Number(row!.id);

    // Publishing requires a published, priced offering (existing trigger),
    // so give the test business one, take it live, then unpublish it.
    const { error: offeringError } = await admin.from("offerings").insert({
      organization_id: orgId,
      type: "service",
      slug: "test-offering",
      name: "TEST — delete offering",
      price_cents: 1000,
      is_published: true,
    });
    expect(offeringError).toBeNull();

    const { error: publishError } = await admin.from("organizations").update({ is_published: true, status: "live" }).eq("id", orgId);
    expect(publishError).toBeNull();

    const { error: unpublishError } = await admin.from("organizations").update({ is_published: false }).eq("id", orgId);
    expect(unpublishError).toBeNull();

    const { data: after } = await admin.from("organizations").select("status,is_published").eq("id", orgId).single();
    expect(after).toMatchObject({ status: "approved", is_published: false });
  });
});
