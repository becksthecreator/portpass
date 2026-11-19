import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAllWeddingPackages, upsertWeddingPackage, type WeddingPackageInput } from "./weddingPackages";

// A Wedding Desk package photo, against CI's local Supabase stack: one of
// BWS's own photos is saved, anything else is refused before a row is
// written. The uploaded-photo URLs are built the way the upload routes
// build them (getPublicUrl on org-assets); nothing is uploaded. The TEST
// package is deleted afterwards.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const tag = crypto.randomUUID().slice(0, 6);
const slug = `test-delete-photo-${tag}`;
let bwsId = 0;
let otherOrgId = 0;

const input = (imageUrl: string | null): WeddingPackageInput => ({
  slug,
  name: `TEST — delete ${tag}`,
  tagline: null,
  description: null,
  includes: [],
  priceFromCents: null,
  priceNote: "from",
  visibility: "draft",
  isFeatured: false,
  imageUrl,
  sortOrder: 99,
});

const uploaded = (orgId: number) => admin.storage.from("org-assets").getPublicUrl(`org/${orgId}/photo/${crypto.randomUUID()}.jpg`).data.publicUrl;

async function saved(): Promise<{ id: number; image_url: string | null } | null> {
  const { data, error } = await admin.from("wedding_packages").select("id,image_url").eq("slug", slug).maybeSingle();
  expect(error).toBeNull();
  return data ? { id: Number(data.id), image_url: data.image_url as string | null } : null;
}

beforeAll(async () => {
  const { data: bws } = await admin.from("organizations").select("id").eq("slug", "bahamas-weddings").single();
  bwsId = Number(bws!.id);
  const { data: other } = await admin.from("organizations").select("id").neq("id", bwsId).limit(1).maybeSingle();
  otherOrgId = other ? Number(other.id) : bwsId + 1;
});

afterAll(async () => {
  await admin.from("wedding_packages").delete().eq("slug", slug);
  // Where 202610240001 keeps a BWS offering per package, take the TEST one too.
  await admin.from("offerings").delete().eq("organization_id", bwsId).eq("slug", slug);
});

describe("upsertWeddingPackage: the package photo", () => {
  it("refuses an outside photo, another business's upload or a path outside the BWS folder, writing nothing", async () => {
    for (const imageUrl of [
      "https://tracker.example.com/pixel.gif",
      "//evil.example/photo.jpg",
      "/weddings/other/photo.webp",
      "/weddings/bahamas-by-the-sea/../../photo.jpg",
      uploaded(otherOrgId),
      uploaded(bwsId).replace("/org-assets/", "/org-uploads/"),
      uploaded(bwsId).replace(/^https?:\/\/[^/]+/, "https://other.supabase.co"),
    ]) {
      await expect(upsertWeddingPackage(null, input(imageUrl))).rejects.toThrow("INVALID_IMAGE");
    }
    expect(await saved()).toBeNull();
  });

  it("saves a photo shipped with the site, one uploaded for BWS, and none", async () => {
    await upsertWeddingPackage(null, input(" /weddings/bahamas-by-the-sea/catalogue-01.webp "));
    const row = await saved();
    expect(row?.image_url).toBe("/weddings/bahamas-by-the-sea/catalogue-01.webp");

    const own = uploaded(bwsId);
    await upsertWeddingPackage(row!.id, input(own));
    expect((await saved())?.image_url).toBe(own);
    expect((await listAllWeddingPackages()).find((p) => p.slug === slug)?.imageUrl).toBe(own);

    await expect(upsertWeddingPackage(row!.id, input("https://tracker.example.com/pixel.gif"))).rejects.toThrow("INVALID_IMAGE");
    expect((await saved())?.image_url).toBe(own);

    await upsertWeddingPackage(row!.id, input(""));
    expect((await saved())?.image_url).toBeNull();
  });
});
