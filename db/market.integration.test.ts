import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMarketProduct, listMarketProductPaths, listMarketProducts, listMarketThingsToDo } from "./market";

// PortPass Market's public lists (brief 25, part B) against the local
// Supabase stack, with TEST businesses deleted afterwards: only a verified
// seller's published products, with the shop open, on a published business
// that is not the demo, ever reach /market, a product page or the sitemap;
// search matches a product's name or its seller's; categories filter;
// Things to do lists what published businesses already offer.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6).replace(/[^a-z0-9]/g, "x");
const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
const prefix = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join("");
const made: number[] = [];

type Seller = { orgId: number; slug: string };
let verified: Seller;
let pending: Seller;
let closedShop: Seller;

// A business with a shop and products, its seller in the given state.
async function seed(name: string, status: "verified" | "pending", options: { shopOpen?: boolean; products: { title: string; category: string; published: boolean }[] }): Promise<Seller> {
  const slug = `test-mkt-${tag}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: `TEST — delete ${name} ${tag}`, slug, primary_category: "shop", status: "approved", whatsapp_e164: "+12425550160", primary_contact: "TEST Contact", licences: [{ type: "Business licence", number: `TEST-${tag}` }] })
    .select("id")
    .single();
  if (error || !org) throw new Error(`could not seed ${name}: ${error?.message}`);
  const orgId = Number(org.id);
  made.push(orgId);
  const shop = await admin.from("shops").insert({ organization_id: orgId, reference_prefix: prefix(), returns_policy: "TEST — 7 days", hold_hours: 48, is_published: options.shopOpen ?? true, seller_status: status, seller_verified_at: status === "verified" ? new Date().toISOString() : null });
  if (shop.error) throw new Error(`could not seed the shop for ${name}: ${shop.error.message}`);
  for (const [index, p] of options.products.entries()) {
    const { data: product, error: pError } = await admin.from("products").insert({ organization_id: orgId, slug: `p-${index}`, title: p.title, description: "TEST — delete", price_cents: 2000 + index * 500, market_category: p.category, sort_order: index, is_published: false }).select("id").single();
    if (pError || !product) throw new Error(`could not seed ${p.title}: ${pError?.message}`);
    await admin.from("product_variants").insert({ product_id: product.id, label: "One size", stock: index === 0 ? 3 : 0, sort_order: 0 });
    if (p.published) {
      const { error: pubError } = await admin.from("products").update({ is_published: true }).eq("id", product.id);
      if (pubError) throw new Error(`could not publish ${p.title}: ${pubError.message}`);
    }
  }
  const live = await admin.from("organizations").update({ is_published: true, is_directory_listed: true, status: "live" }).eq("id", orgId);
  if (live.error) throw new Error(`could not take ${name} live: ${live.error.message}`);
  return { orgId, slug };
}

beforeAll(async () => {
  verified = await seed("Guava Works", "verified", { products: [{ title: `TEST Guava jam ${tag}`, category: "food-drink", published: true }, { title: `TEST Conch bowl ${tag}`, category: "home", published: true }, { title: `TEST Draft thing ${tag}`, category: "home", published: false }] });
  pending = await seed("Waiting Crafts", "pending", { products: [{ title: `TEST Waiting basket ${tag}`, category: "crafts-gifts", published: true }] });
  closedShop = await seed("Closed Shop", "verified", { shopOpen: false, products: [{ title: `TEST Closed hat ${tag}`, category: "kits-apparel", published: true }] });
  // Something to do from the verified seller's business.
  const offering = await admin.from("offerings").insert({ organization_id: verified.orgId, type: "service", slug: `test-tasting-${tag}`, name: `TEST Jam tasting ${tag}`, price_cents: 1500, price_unit: "per_person", is_published: true });
  if (offering.error) throw new Error(`could not seed an offering: ${offering.error.message}`);
});

afterAll(async () => {
  await admin.from("offerings").delete().in("organization_id", made);
  await admin.from("audit_log").delete().in("organization_id", made);
  const { error } = await admin.from("organizations").delete().in("id", made);
  expect(error).toBeNull();
});

describe("Things to buy", () => {
  it("lists only a verified seller's published products from an open shop, newest first", async () => {
    const { items } = await listMarketProducts({ q: tag, pageSize: 50 });
    const titles = items.map((p) => p.title);
    expect(titles).toContain(`TEST Guava jam ${tag}`);
    expect(titles).toContain(`TEST Conch bowl ${tag}`);
    expect(titles).not.toContain(`TEST Draft thing ${tag}`);
    expect(titles).not.toContain(`TEST Waiting basket ${tag}`);
    expect(titles).not.toContain(`TEST Closed hat ${tag}`);
    expect(items.every((p) => p.sellerSlug !== pending.slug && p.sellerSlug !== closedShop.slug)).toBe(true);
  });

  it("finds a product by its name or by its seller's, and filters by category", async () => {
    expect((await listMarketProducts({ q: `Guava jam ${tag}` })).items.map((p) => p.title)).toEqual([`TEST Guava jam ${tag}`]);
    const bySeller = await listMarketProducts({ q: `Guava Works ${tag}` });
    expect(bySeller.items.map((p) => p.title).sort()).toEqual([`TEST Conch bowl ${tag}`, `TEST Guava jam ${tag}`]);
    expect(bySeller.total).toBe(2);
    const home = await listMarketProducts({ q: tag, category: "home" });
    expect(home.items.map((p) => p.title)).toEqual([`TEST Conch bowl ${tag}`]);
    expect((await listMarketProducts({ q: `nothing-like-this-${tag}` })).total).toBe(0);
  });

  it("never lists the demo business, whatever its rows say", async () => {
    const { data: demo } = await admin.from("organizations").select("id").eq("is_demo", true).maybeSingle();
    if (!demo) return;
    const { items } = await listMarketProducts({ pageSize: 200 });
    expect(items.some((p) => p.organizationId === Number(demo.id))).toBe(false);
  });

  it("opens a listed product's page with its sizes, and no page for anything else", async () => {
    const page = await getMarketProduct(verified.slug, "p-0");
    expect(page?.product.title).toBe(`TEST Guava jam ${tag}`);
    expect(page?.product.variants.map((v) => v.label)).toEqual(["One size"]);
    expect(page?.shop.sellerStatus).toBe("verified");
    expect(await getMarketProduct(verified.slug, "p-2")).toBeNull(); // a draft
    expect(await getMarketProduct(pending.slug, "p-0")).toBeNull(); // not verified
    expect(await getMarketProduct(closedShop.slug, "p-0")).toBeNull(); // shop not open
  });

  it("puts only listed products in the sitemap", async () => {
    const paths = await listMarketProductPaths();
    const mine = paths.filter((p) => [verified.slug, pending.slug, closedShop.slug].includes(p.sellerSlug)).map((p) => `${p.sellerSlug}/${p.slug}`).sort();
    expect(mine).toEqual([`${verified.slug}/p-0`, `${verified.slug}/p-1`]);
  });

  it("is not readable through the views from a browser", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    for (const view of ["market_products", "market_things_to_do"]) {
      const { data, error } = await anon.from(view).select("id").limit(1);
      expect(error !== null || (data ?? []).length === 0, `anon must get nothing from ${view}`).toBe(true);
    }
  });
});

describe("Things to do", () => {
  it("lists what a published business offers, with whether it is a verified seller", async () => {
    const { items } = await listMarketThingsToDo({ q: `Jam tasting ${tag}` });
    expect(items.map((t) => t.name)).toEqual([`TEST Jam tasting ${tag}`]);
    expect(items[0]).toMatchObject({ orgSlug: verified.slug, madeInBahamas: true, priceCents: 1500, priceUnit: "per_person" });
    expect((await listMarketThingsToDo({ q: `Jam tasting ${tag}`, madeOnly: true })).total).toBe(1);
    expect((await listMarketThingsToDo({ q: `Jam tasting ${tag}`, section: "weddings" })).total).toBe(0);
  });
});
