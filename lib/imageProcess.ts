import "server-only";
import sharp from "sharp";
import { LOGO_MAX_EDGE, PHOTO_MAX_EDGE, sniffUpload, type UploadKind } from "./imageUpload";

// Every photo or logo a person uploads is re-made here before it is stored
// (brief 19, part E): a phone's 10 MB photo is resized to a web size, an
// iPhone's HEIC is converted, the picture is turned the right way up, and
// what comes out carries none of what the phone wrote into the file (where
// it was taken, when, on which device).
//
// A photo is stored as a JPEG no longer than 2048 px on its longest edge.
// A logo keeps its transparency: a PNG no longer than 512 px.

export type ProcessedImage = { bytes: Buffer; mime: "image/jpeg" | "image/png"; ext: "jpg" | "png"; width: number; height: number; from: UploadKind };

// More pixels than any phone camera saves (a 48 MP photo is 48 million).
const MAX_PIXELS = 80_000_000;

async function decodeHeic(bytes: Buffer): Promise<sharp.Sharp> {
  // Loaded only when a HEIC arrives: the decoder is large, and most
  // uploads never need it.
  const { default: decode } = await import("heic-decode");
  const { width, height, data } = await decode({ buffer: bytes });
  if (!width || !height || width * height > MAX_PIXELS) throw new Error("IMAGE_TOO_LARGE");
  // The decoder has already applied the photo's rotation.
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
}

// null: not a PNG, JPEG, WebP or HEIC at all. Throws when it claims to be
// one and can't be read.
export async function processUpload(bytes: Buffer, kind: "photo" | "logo"): Promise<ProcessedImage | null> {
  const from = sniffUpload(bytes);
  if (!from) return null;
  // rotate() with no angle turns the picture by its orientation tag, so a
  // portrait photo isn't stored on its side once the tag is gone.
  const image = from === "heic" ? await decodeHeic(bytes) : sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate();
  const edge = kind === "logo" ? LOGO_MAX_EDGE : PHOTO_MAX_EDGE;
  const sized = image.resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
  if (kind === "logo") {
    const { data, info } = await sized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    return { bytes: data, mime: "image/png", ext: "png", width: info.width, height: info.height, from };
  }
  // A photo has no see-through parts once it is a JPEG: white behind any.
  const { data, info } = await sized.flatten({ background: "#ffffff" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { bytes: data, mime: "image/jpeg", ext: "jpg", width: info.width, height: info.height, from };
}
