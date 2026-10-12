import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAllWeddingGalleryImages, upsertWeddingGalleryImage, type WeddingGalleryImageInput } from "./weddingSite";

// A Wedding Desk gallery photo, against CI's local Supabase stack: one of
// BWS's own photos is saved, anything else is refused before a row is
// written, and a blank photo is still refused. The uploaded-photo URLs are
// built the way the upload routes build them (getPublicUrl on org-assets);
// nothing is uploaded. The TEST row is a draft and is deleted afterwards.
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const tag = crypto.randomUUID().slice(0, 6);
const caption = `TEST — delete ${tag}`;
let bwsId = 0;
let otherOrgId = 0;

const input = (imageUrl: string): WeddingGalleryImageInput => ({
  imageUrl,
  caption,
  photographerName: null,
  photographerUrl: null,
  isHero: false,
  visibility: "draft",
  sortOrder: 99,
});

const uploaded = (orgId: number) => admin.storage.from("org-assets").getPublicUrl(`org/${orgId}/photo/${crypto.randomUUID()}.jpg`).data.publicUrl;

async function saved(): Promise<{ id: number; image_url: string }[]> {
  const { data, error } = await admin.from("wedding_gallery_images").select("id,image_url").eq("caption", caption);
  expect(error).toBeNull();
  return (data ?? []).map((row) => ({ id: Number(row.id), image_url: row.image_url as string }));
}

beforeAll(async () => {
  const { data: bws } = await admin.from("organizations").select("id").eq("slug", "bahamas-weddings").single();
  bwsId = Number(bws!.id);
  const { data: other } = await admin.from("organizations").select("id").neq("id", bwsId).limit(1).maybeSingle();
  otherOrgId = other ? Number(other.id) : bwsId + 1;
});

afterAll(async () => {
  await admin.from("wedding_gallery_images").delete().eq("caption", caption);
});

describe("upsertWeddingGalleryImage: the gallery photo", () => {
  it("refuses an outside link, another business's upload or a path outside the BWS folder, writing nothing", async () => {
    for (const imageUrl of [
      "https://tracker.example.com/pixel.gif",
      "https://images.squarespace-cdn.com/content/v1/abc/photo.jpg",
      "//evil.example/photo.jpg",
      "/weddings/other/photo.webp",
      "/weddings/bahamas-by-the-sea/../../photo.jpg",
      uploaded(otherOrgId),
      uploaded(bwsId).replace("/org-assets/", "/org-uploads/"),
      uploaded(bwsId).replace(/^https?:\/\/[^/]+/, "https://other.supabase.co"),
    ]) {
      await expect(upsertWeddingGalleryImage(null, input(imageUrl))).rejects.toThrow("INVALID_IMAGE");
    }
    await expect(upsertWeddingGalleryImage(null, input("   "))).rejects.toThrow("IMAGE_URL_REQUIRED");
    expect(await saved()).toEqual([]);
  });

  it("saves a photo shipped with the site and one uploaded for BWS, and keeps it when an outside link is refused", async () => {
    await upsertWeddingGalleryImage(null, input(" /weddings/bahamas-by-the-sea/bws-11.webp "));
    const [row] = await saved();
    expect(row?.image_url).toBe("/weddings/bahamas-by-the-sea/bws-11.webp");

    const own = uploaded(bwsId);
    await upsertWeddingGalleryImage(row.id, input(own));
    expect((await saved()).map((r) => r.image_url)).toEqual([own]);
    expect((await listAllWeddingGalleryImages()).find((image) => image.id === row.id)?.imageUrl).toBe(own);

    await expect(upsertWeddingGalleryImage(row.id, input("https://tracker.example.com/pixel.gif"))).rejects.toThrow("INVALID_IMAGE");
    await expect(upsertWeddingGalleryImage(row.id, input(""))).rejects.toThrow("IMAGE_URL_REQUIRED");
    expect((await saved()).map((r) => r.image_url)).toEqual([own]);
  });
});
