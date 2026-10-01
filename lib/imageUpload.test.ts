import { describe, expect, it } from "vitest";
import { sniffImage, squareCropBox, storagePathFromPublicUrl } from "./imageUpload";

function bytes(...head: number[]): Uint8Array {
  const out = new Uint8Array(64);
  head.forEach((b, i) => { out[i] = b; });
  return out;
}

describe("sniffImage", () => {
  it("recognises PNG, JPEG and WebP by their bytes, whatever the browser claimed", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ mime: "image/jpeg", ext: "jpg" });
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
    expect(sniffImage(webp)).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("rejects anything else, including SVG and HTML dressed up as an image", () => {
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>".padEnd(64, " ")))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<!doctype html><script>alert(1)</script>".padEnd(64, " ")))).toBeNull();
    expect(sniffImage(new Uint8Array(2))).toBeNull();
  });
});

describe("storagePathFromPublicUrl", () => {
  it("returns the object path only for files in our own bucket", () => {
    expect(storagePathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/org-assets/coach/3/abc.jpg")).toBe("coach/3/abc.jpg");
    expect(storagePathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/org-assets/org/1/photo/a%20b.png?t=1")).toBe("org/1/photo/a b.png");
    expect(storagePathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/other-bucket/coach/3/abc.jpg")).toBeNull();
    expect(storagePathFromPublicUrl("/futprep/coaches/ronaldo-greene.jpg")).toBeNull();
    expect(storagePathFromPublicUrl(null)).toBeNull();
    // A malformed % sequence is not a URL we produced: null, never a throw.
    expect(storagePathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/org-assets/coach/3/%E0%A4%A.jpg")).toBeNull();
  });
});

describe("squareCropBox", () => {
  it("cuts the centred square from a landscape or portrait photo and never upscales", () => {
    expect(squareCropBox(1200, 800)).toEqual({ sx: 200, sy: 0, size: 800, out: 640 });
    expect(squareCropBox(600, 900)).toEqual({ sx: 0, sy: 150, size: 600, out: 600 });
    expect(squareCropBox(300, 300)).toEqual({ sx: 0, sy: 0, size: 300, out: 300 });
    expect(squareCropBox(0, 0).size).toBe(1);
  });
});
