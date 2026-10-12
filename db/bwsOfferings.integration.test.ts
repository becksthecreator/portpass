import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOrganizationListingBySlug } from "./organizations";
import { upsertWeddingPackage, type WeddingPackageInput } from "./weddingPackages";

// Bahamas Weddings By The Sea's prices are its wedding_packages (the
// Wedding Desk edits them; its own page and planner read them). Its
// offerings rows are what the generic pages read instead: the listing page
// /weddings/bahamas-weddings and its cards on /weddings/officiants and
// /weddings/planning. On 11 Oct 2026 those rows still held the placeholder
// prices (Hibiscus $3,500 for a $1,960 package), so 202610240001 keeps each
// package's offering in step with it. This proves it on CI's local stack,
// through the Wedding Desk's own write, with a TEST package deleted after.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = crypto.randomUUID().slice(0, 6);
const slug = `test-delete-${tag}`;
const movedSlug = `${slug}-moved`;
let bwsId = 0;

type PackageRow = { slug: string; name: string; tagline: string | null; includes: string[]; price_from_cents: number | null; visibility: string };

async function packages(): Promise<PackageRow[]> {
  const { data, error } = await admin.from("wedding_packages").select("slug,name,tagline,includes,price_from_cents,visibility").order("sort_order");
  expect(error).toBeNull();
  return (data ?? []) as PackageRow[];
}

async function offering(offeringSlug: string) {
  const { data, error } = await admin
    .from("offerings")
    .select("slug,name,summary,price_cents,price_unit,inclusions,action_url,is_published")
    .eq("organization_id", bwsId)
    .eq("slug", offeringSlug)
    .maybeSingle();
  expect(error).toBeNull();
  return data;
}

beforeAll(async () => {
  const { data } = await admin.from("organizations").select("id").eq("slug", "bahamas-weddings").single();
  bwsId = Number(data!.id);
});

afterAll(async () => {
  await admin.from("wedding_packages").delete().in("slug", [slug, movedSlug]);
  await admin.from("offerings").delete().eq("organization_id", bwsId).in("slug", [slug, movedSlug]);
});

describe("Bahamas Weddings By The Sea's offerings follow its wedding packages", () => {
  it("has one offering per package, at the package's price, name, line and inclusions, published while the package is live", async () => {
    const all = await packages();
    expect(all.length).toBeGreaterThan(0);
    for (const pkg of all) {
      expect(await offering(pkg.slug), pkg.slug).toEqual({
        slug: pkg.slug,
        name: pkg.name,
        summary: pkg.tagline,
        price_cents: pkg.price_from_cents,
        price_unit: "from",
        inclusions: pkg.includes,
        // Its button goes to the planner, which also keeps the generic
        // booking form (and its price line) off these rows.
        action_url: `/weddings/bahamas-weddings-by-the-sea/plan?tier=${pkg.slug}`,
        is_published: pkg.visibility === "live",
      });
    }
  });

  it("prices the listing the generic pages read exactly as the live packages", async () => {
    const all = await packages();
    const { data: org } = await admin.from("organizations").select("is_published").eq("id", bwsId).single();
    const listing = await getOrganizationListingBySlug("bahamas-weddings");
    expect(listing === null).toBe(!org?.is_published);
    if (!listing) return;
    const packageSlugs = new Set(all.map((pkg) => pkg.slug));
    const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);
    const shown = listing.offerings.filter((o) => packageSlugs.has(o.slug)).map((o) => ({ slug: o.slug, priceCents: o.priceCents }));
    const live = all.filter((pkg) => pkg.visibility === "live").map((pkg) => ({ slug: pkg.slug, priceCents: pkg.price_from_cents }));
    expect(shown.sort(bySlug)).toEqual(live.sort(bySlug));
  });

  it("carries a Wedding Desk edit to the offering: a new package, a new price, going live, a new slug, removal", async () => {
    const input: WeddingPackageInput = {
      slug,
      name: `TEST — delete ${tag}`,
      tagline: "TEST line",
      description: null,
      includes: ["TEST inclusion"],
      priceFromCents: 12300,
      priceNote: null,
      visibility: "unlisted",
      isFeatured: false,
      imageUrl: null,
      sortOrder: 99,
    };
    await upsertWeddingPackage(null, input);
    expect(await offering(slug)).toMatchObject({ name: input.name, summary: "TEST line", price_cents: 12300, inclusions: ["TEST inclusion"], is_published: false });

    const { data: created } = await admin.from("wedding_packages").select("id").eq("slug", slug).single();
    const id = Number(created!.id);
    await upsertWeddingPackage(id, { ...input, priceFromCents: 45600, visibility: "live" });
    expect(await offering(slug)).toMatchObject({ price_cents: 45600, is_published: true });

    await upsertWeddingPackage(id, { ...input, slug: movedSlug, priceFromCents: 45600, visibility: "live" });
    expect(await offering(slug)).toMatchObject({ is_published: false });
    expect(await offering(movedSlug)).toMatchObject({ price_cents: 45600, is_published: true });

    await admin.from("wedding_packages").delete().eq("id", id);
    expect(await offering(movedSlug)).toMatchObject({ is_published: false });
  });
});
