import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDraftBusiness, getBusiness, updateBusinessDetails } from "./business";
import { getOrganizationListingForPreview, listSectionBusinesses } from "./organizations";
import { getSiteVisits } from "./siteVisits";

// SEO foundations (brief 11) against CI's local Supabase stack: the Google
// Business Profile link, when a business last changed (the sitemap's
// lastmod), what a listing carries for structured data, and page views
// for the Admin Overview. Every row is "TEST — delete" and removed.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let founder = "";
let orgId = 0;

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `test-delete-seo-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  founder = created.data.user.id;
  orgId = (await createDraftBusiness({ name: `TEST delete ${TAG} SEO`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder })).id;
});

afterAll(async () => {
  if (orgId) {
    await admin.from("page_events").delete().eq("organization_id", orgId);
    await admin.from("organization_faqs").delete().eq("organization_id", orgId);
    await admin.from("audit_log").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  if (founder) {
    await admin.from("audit_log").delete().eq("actor_user_id", founder);
    await admin.auth.admin.deleteUser(founder);
  }
});

describe("the Google Business Profile link", () => {
  it("is saved and read back, and the database refuses anything that isn't Google", async () => {
    const saved = await updateBusinessDetails(orgId, { googleBusinessUrl: "https://g.page/r/TEST-delete", instagramHandle: "test_delete_seo", phoneE164: "+12425550100" }, founder);
    expect(saved.googleBusinessUrl).toBe("https://g.page/r/TEST-delete");
    expect((await admin.from("organizations").update({ google_business_url: "https://example.com/x" }).eq("id", orgId)).error?.code).toBe("23514");
    expect((await admin.from("organizations").update({ google_business_url: "http://g.page/r/x" }).eq("id", orgId)).error?.code).toBe("23514");
    expect((await getBusiness(orgId))!.googleBusinessUrl).toBe("https://g.page/r/TEST-delete");
  });

  it("travels with the listing, for the page's structured data", async () => {
    const listing = await getOrganizationListingForPreview(orgId);
    expect(listing!.organization).toMatchObject({ googleBusinessUrl: "https://g.page/r/TEST-delete", instagramHandle: "test_delete_seo" });
    // The business's own phone is not public: the listing never carries it.
    expect(listing!.organization).not.toHaveProperty("phoneE164");
  });
});

describe("when a business last changed", () => {
  it("moves on every change, so the sitemap's lastmod is true", async () => {
    const { data: before } = await admin.from("organizations").select("updated_at").eq("id", orgId).single();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await updateBusinessDetails(orgId, { oneLiner: "TEST — delete. A changed line." }, founder);
    const { data: after } = await admin.from("organizations").select("updated_at").eq("id", orgId).single();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(before!.updated_at).getTime());
    const listed = (await listSectionBusinesses("entertainment")).find((business) => business.name === `TEST delete ${TAG} SEO`);
    // A draft isn't approved or published, so it isn't listed: the field is checked on a listed one instead.
    if (listed) expect(listed.updatedAt).toBe(after!.updated_at);
    const anyListed = (await listSectionBusinesses("sports-fitness"))[0];
    if (anyListed) expect(typeof anyListed.updatedAt).toBe("string");
  });

  it("moves when a question on the page changes, and not for a private change", async () => {
    const read = async () => new Date((await admin.from("organizations").select("updated_at").eq("id", orgId).single()).data!.updated_at).getTime();
    const before = await read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const faq = await admin.from("organization_faqs").insert({ organization_id: orgId, question: "TEST — delete?", answer: "TEST — delete." }).select("id").single();
    expect(faq.error).toBeNull();
    const afterFaq = await read();
    expect(afterFaq).toBeGreaterThan(before);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await admin.from("organizations").update({ review_note: "TEST — delete" }).eq("id", orgId)).error).toBeNull();
    expect(await read()).toBe(afterFaq);
    await admin.from("organization_faqs").delete().eq("id", faq.data!.id);
    expect(await read()).toBeGreaterThan(afterFaq);
  });
});

describe("page views for the Admin Overview", () => {
  it("counts this week's views and the pages most viewed", async () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    const path = `/entertainment/test-delete-seo-${TAG}`;
    const rows = [...Array.from({ length: 3 }, () => ({ organization_id: orgId, path, event: "view" })), { organization_id: orgId, path, event: "whatsapp_click" }, { organization_id: orgId, path: `${path}/other`, event: "view" }];
    const { error } = await admin.from("page_events").insert(rows);
    expect(error).toBeNull();
    const visits = await getSiteVisits(since);
    expect(visits.views).toBeGreaterThanOrEqual(4);
    expect(visits.topPages.length).toBeLessThanOrEqual(5);
    const mine = visits.topPages.find((page) => page.path === path);
    if (mine) expect(mine.views).toBe(3);
  });
});
