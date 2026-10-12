import { describe, expect, it } from "vitest";
import { readPackageImage } from "./weddingPackageImage";

// A package photo is BWS's own or nothing: a photo shipped with the site,
// or one uploaded to org-assets on our own Supabase project. The org
// folder is returned for db/weddingPackages.ts to check against BWS.
const SUPABASE = "https://abc.supabase.co";
const OURS = `${SUPABASE}/storage/v1/object/public/org-assets/`;
const UUID = "0b6c3f4e-1d2a-4b5c-8d9e-0f1a2b3c4d5e";

describe("readPackageImage", () => {
  it("takes no photo as null", () => {
    for (const value of [null, undefined, "", "   "]) expect(readPackageImage(value, SUPABASE)).toEqual({ url: null, orgFolder: null });
  });

  it("takes a photo shipped with the site, trimmed", () => {
    expect(readPackageImage("/weddings/bahamas-by-the-sea/catalogue-01.webp", SUPABASE)).toEqual({ url: "/weddings/bahamas-by-the-sea/catalogue-01.webp", orgFolder: null });
    expect(readPackageImage("  /weddings/bahamas-by-the-sea/antonio.jpg ", undefined)).toEqual({ url: "/weddings/bahamas-by-the-sea/antonio.jpg", orgFolder: null });
  });

  it("takes a photo uploaded to a business's folder in org-assets, and says whose", () => {
    expect(readPackageImage(`${OURS}org/12/photo/${UUID}.jpg`, SUPABASE)).toEqual({ url: `${OURS}org/12/photo/${UUID}.jpg`, orgFolder: 12 });
    expect(readPackageImage(`${OURS}org/7/product/${UUID}.webp`, `${SUPABASE}/`)).toEqual({ url: `${OURS}org/7/product/${UUID}.webp`, orgFolder: 7 });
    expect(readPackageImage(`http://127.0.0.1:54321/storage/v1/object/public/org-assets/org/3/photo/${UUID}.png`, "http://127.0.0.1:54321")?.orgFolder).toBe(3);
  });

  it("refuses an outside image or anything that is not a web image address", () => {
    for (const value of [
      "https://tracker.example.com/pixel.gif",
      "http://evil.example/photo.jpg",
      "//evil.example/photo.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,iVBORw0KGgo=",
      "https://images.unsplash.com/photo-1.jpg",
    ]) expect(readPackageImage(value, SUPABASE)).toBeNull();
  });

  it("refuses a site path outside the BWS photo folder, or one that could lead out of it", () => {
    for (const value of [
      "/weddings/other/photo.webp",
      "weddings/bahamas-by-the-sea/catalogue-01.webp",
      "/weddings/bahamas-by-the-sea/",
      "/weddings/bahamas-by-the-sea/../../api/weddings/admin/packages.jpg",
      "/weddings/bahamas-by-the-sea/%2e%2e/x.jpg",
      "/weddings/bahamas-by-the-sea/catalogue-01.webp?track=1",
      "/weddings/bahamas-by-the-sea/catalogue-01.webp#x",
      "/weddings/bahamas-by-the-sea/logo.svg",
      "/weddings/bahamas-by-the-sea//evil.example/x.jpg",
    ]) expect(readPackageImage(value, SUPABASE)).toBeNull();
  });

  it("refuses a storage URL on another host, in another bucket or outside a business's folder", () => {
    for (const value of [
      `https://other.supabase.co/storage/v1/object/public/org-assets/org/12/photo/${UUID}.jpg`,
      `https://abc.supabase.co.evil.example/storage/v1/object/public/org-assets/org/12/photo/${UUID}.jpg`,
      `https://abc.supabase.co@evil.example/storage/v1/object/public/org-assets/org/12/photo/${UUID}.jpg`,
      `http://abc.supabase.co/storage/v1/object/public/org-assets/org/12/photo/${UUID}.jpg`,
      `${SUPABASE}/storage/v1/object/public/org-uploads/org/12/incoming/${UUID}/00`,
      `${SUPABASE}/storage/v1/object/sign/org-assets/org/12/photo/${UUID}.jpg?token=x`,
      `${OURS}coach/3/${UUID}.jpg`,
      `${OURS}org/012/photo/${UUID}.jpg`,
      `${OURS}org/12/../13/photo/${UUID}.jpg`,
      `${OURS}org/12/photo/${UUID}.jpg?t=1`,
      `${OURS}org/12/photo/a%2Fb.jpg`,
      `${OURS}org/12/export.json`,
    ]) expect(readPackageImage(value, SUPABASE)).toBeNull();
  });

  it("refuses every storage URL when SUPABASE_URL is missing or not a web address", () => {
    const url = `${OURS}org/12/photo/${UUID}.jpg`;
    expect(readPackageImage(url, undefined)).toBeNull();
    expect(readPackageImage(url, "")).toBeNull();
    expect(readPackageImage(url, "not a url")).toBeNull();
    expect(readPackageImage(`null/storage/v1/object/public/org-assets/org/12/photo/${UUID}.jpg`, "file:///tmp")).toBeNull();
  });

  it("refuses a value that is not text", () => {
    for (const value of [12, true, {}, ["/weddings/bahamas-by-the-sea/catalogue-01.webp"]]) expect(readPackageImage(value, SUPABASE)).toBeNull();
  });
});
