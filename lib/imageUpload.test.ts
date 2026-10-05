import { describe, expect, it } from "vitest";
import { chunkCount, chunkPosition, incomingPartPath, isHeic, isUploadedCoachPhoto, isUploadId, MAX_ORIGINAL_BYTES, MAX_UPLOAD_CHUNKS, sniffImage, sniffUpload, squareCropBox, storagePathFromPublicUrl, UPLOAD_CHUNK_BYTES } from "./imageUpload";

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

describe("isUploadedCoachPhoto", () => {
  it("is true only for a photo in our bucket's coach folder", () => {
    expect(isUploadedCoachPhoto("https://x.supabase.co/storage/v1/object/public/org-assets/coach/3/abc.jpg")).toBe(true);
    expect(isUploadedCoachPhoto("https://x.supabase.co/storage/v1/object/public/org-assets/org/1/photo/a.jpg")).toBe(false);
    expect(isUploadedCoachPhoto("/futprep/coaches/ronaldo-greene.jpg")).toBe(false);
    expect(isUploadedCoachPhoto(null)).toBe(false);
  });
});

describe("squareCropBox", () => {
  it("cuts the centred square from a landscape or portrait photo and never upscales", () => {
    expect(squareCropBox(1200, 800)).toEqual({ sx: 200, sy: 0, size: 800, out: 800 });
    expect(squareCropBox(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000, out: 1000 });
    expect(squareCropBox(600, 900)).toEqual({ sx: 0, sy: 150, size: 600, out: 600 });
    expect(squareCropBox(300, 300)).toEqual({ sx: 0, sy: 0, size: 300, out: 300 });
    expect(squareCropBox(0, 0).size).toBe(1);
  });
});

// A file's first box: its size, "ftyp", the major brand, a version, then
// the compatible brands.
function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const size = 16 + compatible.length * 4;
  const out = new Uint8Array(Math.max(64, size));
  out[3] = size;
  [..."ftyp", ...major].forEach((c, i) => { out[4 + i] = c.charCodeAt(0); });
  compatible.join("").split("").forEach((c, i) => { out[16 + i] = c.charCodeAt(0); });
  return out;
}

describe("photos from a phone", () => {
  it("recognises HEIC by its brand, whatever the file is called", () => {
    expect(isHeic(ftyp("heic", "mif1", "heic"))).toBe(true);
    expect(isHeic(ftyp("heix"))).toBe(true);
    // A generic brand whose compatible brands say it holds an HEVC image.
    expect(isHeic(ftyp("mif1", "mif1", "heic"))).toBe(true);
    expect(isHeic(ftyp("msf1", "hevc"))).toBe(true);
  });

  it("does not take AVIF, a video or a short file for HEIC", () => {
    expect(isHeic(ftyp("avif", "mif1", "miaf"))).toBe(false);
    expect(isHeic(ftyp("mif1", "avif"))).toBe(false);
    expect(isHeic(ftyp("isom", "mp42"))).toBe(false);
    expect(isHeic(ftyp("qt  "))).toBe(false);
    expect(isHeic(new Uint8Array(8))).toBe(false);
    expect(isHeic(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(false);
  });

  it("names what an upload is, or refuses it", () => {
    expect(sniffUpload(bytes(0xff, 0xd8, 0xff, 0xe1))).toBe("jpeg");
    expect(sniffUpload(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffUpload(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("webp");
    expect(sniffUpload(ftyp("heic"))).toBe("heic");
    expect(sniffUpload(ftyp("avif"))).toBeNull();
    expect(sniffUpload(new TextEncoder().encode("%PDF-1.7".padEnd(64, " ")))).toBeNull();
    expect(sniffUpload(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>".padEnd(64, " ")))).toBeNull();
  });

  it("sends a big photo in pieces of 3 MB, up to 24 MB", () => {
    expect(UPLOAD_CHUNK_BYTES).toBe(3 * 1024 * 1024);
    expect(MAX_ORIGINAL_BYTES).toBe(24 * 1024 * 1024);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(UPLOAD_CHUNK_BYTES)).toBe(1);
    expect(chunkCount(UPLOAD_CHUNK_BYTES + 1)).toBe(2);
    // A 10 MB photo from a phone.
    expect(chunkCount(10 * 1024 * 1024)).toBe(4);
    expect(chunkCount(MAX_ORIGINAL_BYTES)).toBe(MAX_UPLOAD_CHUNKS);
  });

  it("takes only a whole-numbered piece that is in range", () => {
    expect(chunkPosition("0", "4")).toEqual({ index: 0, total: 4 });
    expect(chunkPosition(3, 4)).toEqual({ index: 3, total: 4 });
    expect(chunkPosition(4, 4)).toBeNull();
    expect(chunkPosition(-1, 4)).toBeNull();
    expect(chunkPosition(0, 0)).toBeNull();
    expect(chunkPosition(0, MAX_UPLOAD_CHUNKS + 1)).toBeNull();
    expect(chunkPosition("1.5", "4")).toBeNull();
    expect(chunkPosition(null, null)).toBeNull();
    expect(chunkPosition(undefined, undefined)).toBeNull();
  });

  it("uses only a real UUID as an upload's id, because it becomes a storage path", () => {
    expect(isUploadId("3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c")).toBe(true);
    expect(isUploadId("../../org/2/photo")).toBe(false);
    expect(isUploadId("3F2B8C1E-9A4D-4E7B-8C2A-1D5E6F7A8B9C")).toBe(false);
    expect(isUploadId("")).toBe(false);
    expect(isUploadId(42)).toBe(false);
    expect(incomingPartPath(7, "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c", 3)).toBe("org/7/incoming/3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c/03");
  });
});
