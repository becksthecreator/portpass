import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { missingItems } from "@/lib/pageChecklist";
import { getBusinessChecklist, listBusinessChecklists } from "./pageChecklist";

// "What your page is missing" (brief 19, part D) against CI's local
// Supabase stack: a TEST business with everything, one with nothing, and
// one whose photos may include children, each read from its own rows.
// Every row is "TEST — delete" and removed with its business.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 6);
const slug = (name: string) => `test-delete-chk-${name}-${TAG}`;
let fullId = 0;
let emptyId = 0;
let kidsId = 0;

const missing = async (id: number) => missingItems((await getBusinessChecklist(id))!.items).map((item) => item.key);
const photo = (organization_id: number, n: number, consent_confirmed: boolean) => ({ organization_id, url: `https://example.test/${TAG}/${organization_id}/${n}.jpg`, alt: "TEST — delete", sort_order: n, consent_confirmed });

beforeAll(async () => {
  const business = (name: string, extra: Record<string, unknown> = {}) => ({ name: `TEST delete ${TAG} ${name}`, slug: slug(name), primary_category: "entertainment", status: "approved", one_liner: "TEST — delete.", hero_image_url: null, whatsapp_e164: null, instagram_handle: null, google_business_url: null, photo_consent_required: false, ...extra });
  const { data: orgs, error } = await db
    .from("organizations")
    .insert([
      business("full", { hero_image_url: `https://example.test/${TAG}/hero.jpg`, whatsapp_e164: "+12425550170", instagram_handle: "testdelete", google_business_url: "https://g.page/r/test-delete" }),
      business("empty"),
      // Photos may include children: only consented ones count, and the
      // hero must be one of them.
      business("kids", { hero_image_url: `https://example.test/${TAG}/unconsented-hero.jpg`, photo_consent_required: true }),
    ])
    .select("id,slug");
  if (error || !orgs) throw new Error(`Could not seed the TEST businesses: ${error?.message}`);
  fullId = Number(orgs.find((o) => o.slug === slug("full"))!.id);
  emptyId = Number(orgs.find((o) => o.slug === slug("empty"))!.id);
  kidsId = Number(orgs.find((o) => o.slug === slug("kids"))!.id);

  const seeded = await Promise.all([
    db.from("organization_images").insert([...[1, 2, 3, 4, 5].map((n) => photo(fullId, n, false)), ...[1, 2, 3, 4, 5, 6].map((n) => photo(kidsId, n, n <= 2))]),
    db.from("offerings").insert([
      { organization_id: fullId, type: "service", slug: `priced-${TAG}`, name: "TEST priced", price_cents: 5000, is_published: true },
      { organization_id: kidsId, type: "service", slug: `draft-${TAG}`, name: "TEST unpublished", price_cents: 5000, is_published: false },
      { organization_id: emptyId, type: "service", slug: `noprice-${TAG}`, name: "TEST no price", price_cents: null, is_published: false },
    ]),
    db.from("organization_payment_settings").insert([
      { organization_id: fullId, reference_prefix: "TF", accepted_methods: ["cash"] },
      // Bank transfer chosen but its details not given: Get paid isn't done.
      { organization_id: kidsId, reference_prefix: "TK", accepted_methods: ["bank_transfer"] },
    ]),
    db.from("member_perks").insert([
      { organization_id: fullId, title: "TEST delete perk", kind: "priority", status: "live", published_at: new Date().toISOString() },
      { organization_id: kidsId, title: "TEST delete draft perk", kind: "priority", status: "draft", published_at: null },
    ]),
  ]);
  for (const result of seeded) if (result.error) throw new Error(`Could not seed the checklist rows: ${result.error.message}`);
});

afterAll(async () => {
  for (const id of [fullId, emptyId, kidsId].filter(Boolean)) {
    await db.from("member_perks").delete().eq("organization_id", id);
    await db.from("audit_log").delete().eq("organization_id", id);
    const { error } = await db.from("organizations").delete().eq("id", id);
    expect(error).toBeNull();
  }
});

describe("what a page is missing, from the data", () => {
  it("a business with everything is missing nothing", async () => {
    const list = await getBusinessChecklist(fullId);
    expect(list).toMatchObject({ organizationId: fullId, slug: slug("full"), status: "approved", isPublished: false });
    expect(list!.items).toHaveLength(9);
    expect(await missing(fullId)).toEqual([]);
  });

  it("a business with nothing is missing all nine, each with its link", async () => {
    const list = await getBusinessChecklist(emptyId);
    expect(missingItems(list!.items).map((item) => item.key)).toEqual(["hero", "photos", "price", "whatsapp", "instagram", "get_paid", "perk", "google", "open"]);
    expect(list!.items.every((item) => item.href.startsWith(`/business/${slug("empty")}/`))).toBe(true);
  });

  it("where photos may include children, only consented ones count; a half-finished Get paid and a draft perk don't", async () => {
    const list = await getBusinessChecklist(kidsId);
    const item = (key: string) => list!.items.find((i) => i.key === key)!;
    // Two of six photos have consent: the page shows those two, and one
    // of them stands in as the hero.
    expect(item("hero").done).toBe(true);
    expect(item("photos")).toMatchObject({ done: false, detail: "2 so far. Add 3 more to reach 5." });
    // It has a price, but nothing published or open to book.
    expect(item("price").done).toBe(true);
    expect(item("open").done).toBe(false);
    expect(item("get_paid").done).toBe(false);
    expect(item("perk").done).toBe(false);
  });

  it("changes as the data changes", async () => {
    await db.from("organizations").update({ whatsapp_e164: "+12425550171" }).eq("id", emptyId);
    expect(await missing(emptyId)).not.toContain("whatsapp");
    await db.from("organizations").update({ whatsapp_e164: null }).eq("id", emptyId);
    expect(await missing(emptyId)).toContain("whatsapp");
  });

  it("is nothing for a business that doesn't exist", async () => {
    expect(await getBusinessChecklist(999_999_999)).toBeNull();
  });
});

describe("every business in one table", () => {
  it("lists each business once with its nine items, and never the demo", async () => {
    const lists = await listBusinessChecklists();
    const mine = lists.filter((list) => [fullId, emptyId, kidsId].includes(list.organizationId));
    expect(mine).toHaveLength(3);
    expect(mine.every((list) => list.items.length === 9)).toBe(true);
    expect(new Set(lists.map((list) => list.organizationId)).size).toBe(lists.length);
    const { data: demo } = await db.from("organizations").select("id").eq("is_demo", true).maybeSingle();
    if (demo) expect(lists.some((list) => list.organizationId === Number(demo.id))).toBe(false);
  });

  it("puts live businesses first", async () => {
    const statuses = (await listBusinessChecklists()).map((list) => list.status);
    const order = ["live", "approved", "submitted", "draft", "suspended"];
    const ranks = statuses.map((status) => (order.indexOf(status) === -1 ? 9 : order.indexOf(status)));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
