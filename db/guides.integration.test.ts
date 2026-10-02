import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDraftBusiness, updateBusinessDetails, updatePaymentMethods, upsertBusinessOffering } from "./business";
import { publishForOwner } from "./adminBusinessActions";
import { getGuide, guideBusinesses, guidesMentioning, listAllGuides, saveGuide, setGuideStatus } from "./guides";

// Guides (brief 11, 3) against CI's local Supabase stack: the five drafts
// the migration adds, publishing refused until a guide is written and
// linked, and the links between a guide and the businesses in it. Every
// guide and business made here is "TEST — delete" and removed.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
let founder = "";
let liveOrg = 0;
let liveSlug = "";
let draftOrg = 0;
let guideId = 0;

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email: `test-delete-guides-${TAG}@test.portpass.local`, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the test user: ${created.error?.message}`);
  founder = created.data.user.id;
  const live = await createDraftBusiness({ name: `TEST delete ${TAG} Guide Booth`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder });
  await updateBusinessDetails(live.id, { oneLiner: "TEST one line.", whatsappE164: "+12425550100" }, founder);
  await updatePaymentMethods(live.id, founder, { paymentMethods: ["cash"], bankTransferDetails: null });
  await upsertBusinessOffering(live.id, null, { name: "TEST booth", summary: null, priceCents: 30000, priceUnit: null, scheduleText: null, capacity: null, type: "service" }, founder);
  await publishForOwner(live.id, founder);
  liveOrg = live.id;
  liveSlug = live.slug!;
  draftOrg = (await createDraftBusiness({ name: `TEST delete ${TAG} Guide Draft`, section: "entertainment", subcategory: null, ownerUserId: null, createdByAdmin: true, actorUserId: founder })).id;
});

afterAll(async () => {
  if (guideId) await admin.from("guides").delete().eq("id", guideId);
  for (const id of [liveOrg, draftOrg]) {
    if (!id) continue;
    await admin.from("audit_log").delete().eq("organization_id", id);
    await admin.from("organizations").delete().eq("id", id);
  }
  if (founder) {
    await admin.from("audit_log").delete().eq("actor_user_id", founder);
    await admin.auth.admin.deleteUser(founder);
  }
});

const words = "Real words written by a person about Nassau. ".repeat(12);

describe("the five guides", () => {
  it("start as drafts with an outline, and none is public", async () => {
    const all = await listAllGuides();
    const slugs = ["things-to-do-in-nassau-with-kids", "kids-football-and-sports-nassau", "birthday-party-nassau", "getting-married-in-the-bahamas", "nassau-for-cruise-visitors"];
    for (const slug of slugs) {
      const guide = all.find((g) => g.slug === slug);
      expect(guide).toBeDefined();
      expect(guide!.body).toContain("[Antonio:");
      // The description is Antonio's to write too.
      expect(guide!.description).toContain("[Antonio:");
    }
    // An outline can't be published.
    const outline = all.find((g) => g.slug === slugs[0])!;
    if (outline.status === "draft") await expect(setGuideStatus(outline.id, "published", founder)).rejects.toThrow("NOT_PUBLISHABLE");
  });
});

describe("a guide", () => {
  it("is published only once it is written and links a live business", async () => {
    const guide = await saveGuide(null, { slug: `test-delete-${TAG}`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: words }, [], founder);
    guideId = guide.id;
    await expect(setGuideStatus(guideId, "published", founder)).rejects.toThrow("NOT_PUBLISHABLE");
    // A business that isn't live doesn't count.
    await saveGuide(guideId, { slug: `test-delete-${TAG}`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: words }, [{ organizationId: draftOrg, note: null, sortOrder: 0 }], founder);
    await expect(setGuideStatus(guideId, "published", founder)).rejects.toThrow("NOT_PUBLISHABLE");
    await saveGuide(guideId, { slug: `test-delete-${TAG}`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: words }, [{ organizationId: liveOrg, note: "TEST the booth", sortOrder: 0 }, { organizationId: draftOrg, note: null, sortOrder: 1 }], founder);
    expect((await setGuideStatus(guideId, "published", founder)).status).toBe("published");
    // The page lists only the live business, with its line.
    expect((await guideBusinesses(guideId)).map((b) => [b.slug, b.note])).toEqual([[liveSlug, "TEST the booth"]]);
    expect((await getGuide(guideId))!.listings).toHaveLength(2);
  });

  it("can't be saved back into an unpublishable state while it is published", async () => {
    await expect(saveGuide(guideId, { slug: `test-delete-${TAG}`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: `${words}[Antonio: more]` }, [{ organizationId: liveOrg, note: null, sortOrder: 0 }], founder)).rejects.toThrow("NOT_PUBLISHABLE");
    const { data: logged } = await admin.from("audit_log").select("action").eq("target_table", "guides").eq("target_id", String(guideId));
    expect(logged!.map((row) => row.action)).toEqual(expect.arrayContaining(["guide.created", "guide.updated", "guide.published"]));
  });

  it("saves all or nothing, and keeps its address once published", async () => {
    const before = await getGuide(guideId);
    // A business that doesn't exist: nothing changes, not even the words.
    await expect(saveGuide(guideId, { slug: `test-delete-${TAG}`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: `${words} Changed.` }, [{ organizationId: liveOrg, note: null, sortOrder: 0 }, { organizationId: 2_000_000_000, note: null, sortOrder: 1 }], founder)).rejects.toThrow("BAD_BUSINESS");
    const after = await getGuide(guideId);
    expect(after!.body).toBe(before!.body);
    expect(after!.listings).toEqual(before!.listings);
    // Only a business that isn't live: refused while published.
    await expect(saveGuide(guideId, { slug: `test-delete-${TAG}`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: words }, [{ organizationId: draftOrg, note: null, sortOrder: 0 }], founder)).rejects.toThrow("NOT_PUBLISHABLE");
    await expect(saveGuide(guideId, { slug: `test-delete-${TAG}-moved`, title: `TEST delete ${TAG} guide`, description: "TEST — delete. A guide written for the integration tests, long enough.", body: words }, [{ organizationId: liveOrg, note: null, sortOrder: 0 }], founder)).rejects.toThrow("SLUG_FROZEN");
    // The database refuses too, whatever the app checked first.
    const direct = await admin.rpc("set_guide_status", { p_id: guideId, p_status: "published", p_actor: founder });
    expect(direct.error).toBeNull();
    const { error: frozen } = await admin.rpc("save_guide", { p_id: guideId, p_slug: `test-delete-${TAG}-moved`, p_title: `TEST delete ${TAG} guide`, p_description: "TEST — delete. A guide written for the integration tests, long enough.", p_body: words, p_listings: [{ organizationId: liveOrg }], p_actor: founder });
    expect(frozen?.message).toBe("SLUG_FROZEN");
    const { error: unfit } = await admin.rpc("save_guide", { p_id: guideId, p_slug: `test-delete-${TAG}`, p_title: `TEST delete ${TAG} guide`, p_description: "TEST — delete. A guide written for the integration tests, long enough.", p_body: `${words}[Antonio: more]`, p_listings: [{ organizationId: liveOrg }], p_actor: founder });
    expect(unfit?.message).toBe("NOT_PUBLISHABLE");
    expect((await getGuide(guideId))!.body).toBe(before!.body);
  });

  it("is linked from the business's page, and a second guide can't take the same address", async () => {
    // guidesMentioning reads the cached list; outside a Next request the cache is the read itself.
    const mentions = await guidesMentioning(liveSlug, { fresh: true });
    expect(mentions.map((m) => m.slug)).toContain(`test-delete-${TAG}`);
    await expect(saveGuide(null, { slug: `test-delete-${TAG}`, title: "TEST delete another guide", description: "", body: "" }, [], founder)).rejects.toThrow("SLUG_TAKEN");
    expect((await setGuideStatus(guideId, "draft", founder)).status).toBe("draft");
  });
});
