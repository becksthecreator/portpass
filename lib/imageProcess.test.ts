import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The real decoder is exercised end to end by the photos job
// (.github/workflows/photos-e2e.yml) with a HEIC made in that job. Here it
// is replaced by one that hands back a small red picture, to check what
// is done with the pixels it returns.
vi.mock("heic-decode", () => ({
  default: vi.fn(async () => {
    const width = 6;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([200, 30, 30, 255], i);
    return { width, height, data };
  }),
}));

import { processUpload } from "./imageProcess";

const noise = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: "gaussian", mean: 128, sigma: 60 } } });

describe("processUpload", () => {
  it("resizes a 10 MB phone photo to a web-sized JPEG", async () => {
    const original = await noise(6000, 4000).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
    expect(original.length).toBeGreaterThan(10 * 1024 * 1024);
    const made = await processUpload(original, "photo");
    expect(made).toMatchObject({ mime: "image/jpeg", ext: "jpg", width: 2048, height: 1365, from: "jpeg" });
    expect(made!.bytes.length).toBeLessThan(original.length / 4);
    const meta = await sharp(made!.bytes).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 2048, height: 1365 });
  }, 60_000);

  it("turns a photo the right way up and removes where and when it was taken", async () => {
    // As a phone saves a portrait shot: stored on its side, with a tag
    // saying so, and the place it was taken.
    const original = await noise(1200, 800)
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Make: "TESTPHONE" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "25/1 3/1 36/1", GPSLongitudeRef: "W", GPSLongitude: "77/1 20/1 42/1" } })
      .jpeg({ quality: 90 })
      .toBuffer();
    const before = await sharp(original).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif).toBeDefined();

    const made = await processUpload(original, "photo");
    // Turned: 1200 x 800 on its side is 800 x 1200 upright.
    expect(made).toMatchObject({ width: 800, height: 1200 });
    const after = await sharp(made!.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(made!.bytes.includes(Buffer.from("TESTPHONE"))).toBe(false);
  });

  it("never enlarges a small photo", async () => {
    const original = await noise(300, 200).jpeg().toBuffer();
    expect(await processUpload(original, "photo")).toMatchObject({ width: 300, height: 200 });
  });

  it("stores a PNG or WebP photo as a JPEG, white where it was see-through", async () => {
    const png = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const made = await processUpload(png, "photo");
    expect(made).toMatchObject({ mime: "image/jpeg", from: "png", width: 40, height: 20 });
    const { data } = await sharp(made!.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(245);
    const webp = await noise(100, 50).webp().toBuffer();
    expect(await processUpload(webp, "photo")).toMatchObject({ mime: "image/jpeg", from: "webp", width: 100, height: 50 });
  });

  it("keeps a logo's transparency, no longer than 512 px", async () => {
    const logo = await sharp({ create: { width: 1000, height: 400, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } }).png().toBuffer();
    const made = await processUpload(logo, "logo");
    expect(made).toMatchObject({ mime: "image/png", ext: "png", width: 512, height: 205 });
    const meta = await sharp(made!.bytes).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it("converts a HEIC photo from the pixels the decoder returns", async () => {
    const heic = new Uint8Array(64);
    heic[3] = 24;
    [..."ftypheic"].forEach((c, i) => { heic[4 + i] = c.charCodeAt(0); });
    const made = await processUpload(Buffer.from(heic), "photo");
    expect(made).toMatchObject({ mime: "image/jpeg", ext: "jpg", from: "heic", width: 6, height: 4 });
    const { data } = await sharp(made!.bytes).raw().toBuffer({ resolveWithObject: true });
    // Still red.
    expect(data[0]).toBeGreaterThan(150);
    expect(data[1]).toBeLessThan(90);
  });

  it("refuses what isn't a picture, and says so when a picture can't be read", async () => {
    expect(await processUpload(Buffer.from("%PDF-1.7 not a photo".padEnd(64, " ")), "photo")).toBeNull();
    expect(await processUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>".padEnd(64, " ")), "photo")).toBeNull();
    // Starts like a JPEG, then nothing a decoder can use.
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(processUpload(broken, "photo")).rejects.toThrow();
  });
});
