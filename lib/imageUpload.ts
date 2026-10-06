// Shared rules for every image a person uploads to PortPass: the business
// setup wizard (app/api/business/orgs/[id]/images) and the Futprep team
// photos (app/api/futprep/team/photo, brief 16 C2). Both store in the same
// Supabase Storage bucket and both trust the bytes, not the declared type.

export const ORG_ASSETS_BUCKET = "org-assets";

// Vercel's request body limit is 4.5 MB; uploads are downscaled in the
// browser before they are sent, so this is a backstop, not the normal path.
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;

export type SniffedImage = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

// Declared MIME types are whatever the browser says; the magic bytes are
// what counts.
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let i = from; i < to; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

// ---- photos from a phone (brief 19, part E) ---------------------------------------

// HEIC / HEIF: what an iPhone's camera saves, and some Android phones'.
// An ISO media file whose first box is "ftyp" and whose brand, or one of
// its compatible brands, is an HEVC image brand. (AVIF shares the
// container but carries the "avif" brand, and is not accepted.)
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);

export function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || ascii(bytes, 4, 8) !== "ftyp") return false;
  if (HEIC_BRANDS.has(ascii(bytes, 8, 12))) return true;
  // "mif1" / "msf1" are generic: the compatible brands say what is inside.
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(bytes.length, boxSize >= 16 && boxSize <= 4096 ? boxSize : 16);
  for (let at = 16; at + 4 <= end; at += 4) if (HEIC_BRANDS.has(ascii(bytes, at, at + 4))) return true;
  return false;
}

// What a photo upload may be: the three web formats, or HEIC, which the
// server converts. Everything is re-encoded on the server before it is
// stored (lib/imageProcess.ts), which also removes the location and
// camera details a phone writes into a photo.
export type UploadKind = "png" | "jpeg" | "webp" | "heic";

export function sniffUpload(bytes: Uint8Array): UploadKind | null {
  const web = sniffImage(bytes);
  if (web) return web.ext === "jpg" ? "jpeg" : web.ext;
  return isHeic(bytes) ? "heic" : null;
}

// A phone photo is 3-12 MB and the host caps a request at 4.5 MB. The
// browser shrinks what it can decode; anything it can't, or that is still
// too big, is sent in pieces through our own server and put back together
// there (never from the browser straight to storage).
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;
// One request carries a whole photo up to this size.
export const SINGLE_UPLOAD_BYTES = 3_500_000;
export const MAX_UPLOAD_CHUNKS = 4;
// 10 MB (Brief 21, part E): the largest photo a current phone saves; the
// browser shrinks what it can before sending, so almost nothing reaches this.
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
// Where the pieces wait: a private bucket only the server can read.
export const INCOMING_BUCKET = "org-uploads";

export function chunkCount(size: number): number {
  return Math.max(1, Math.ceil(size / UPLOAD_CHUNK_BYTES));
}

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The upload's id is made in the browser and becomes part of a storage
// path, so only a real UUID is ever used as one.
export function isUploadId(value: unknown): value is string {
  return typeof value === "string" && UPLOAD_ID.test(value);
}

export function incomingPrefix(organizationId: number, uploadId: string): string {
  return `org/${organizationId}/incoming/${uploadId}`;
}

export function incomingPartPath(organizationId: number, uploadId: string, index: number): string {
  return `${incomingPrefix(organizationId, uploadId)}/${String(index).padStart(2, "0")}`;
}

// One piece of a chunked upload, as the route received it: its place and
// the total, both whole numbers in range.
export function chunkPosition(index: unknown, total: unknown): { index: number; total: number } | null {
  const i = Number(index);
  const t = Number(total);
  if (index === null || index === undefined || total === null || total === undefined) return null;
  if (!Number.isInteger(i) || !Number.isInteger(t) || t < 1 || t > MAX_UPLOAD_CHUNKS || i < 0 || i >= t) return null;
  return { index: i, total: t };
}

// The longest edge a stored photo keeps, and a logo's.
export const PHOTO_MAX_EDGE = 2048;
export const LOGO_MAX_EDGE = 512;

// The object path inside our bucket for a public URL Supabase gave us, or
// null for any other URL (a coach photo pasted from elsewhere, say). The
// bucket is shared by every business, so a caller must still check the path
// sits in the folder it owns (org/{id}/, coach/{id}/) before deleting it.
export function storagePathFromPublicUrl(url: string | null | undefined, bucket: string = ORG_ASSETS_BUCKET): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  if (path.length === 0) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return null; // a malformed % sequence: not a URL we produced
  }
}

// The centred square to cut from a photo of width × height, and the size
// to resample it to (never upscaled). 1000px keeps a coach photo sharp in
// the largest frame it is shown in (about 333px wide on a 3x phone).
// True for a photo our own upload cropped square (coach/{id}/...), so a
// page can give it a square frame; a pasted URL keeps the old tall frame.
export function isUploadedCoachPhoto(url: string | null | undefined): boolean {
  return storagePathFromPublicUrl(url)?.startsWith("coach/") ?? false;
}

export function squareCropBox(width: number, height: number, maxSize = 1000): { sx: number; sy: number; size: number; out: number } {
  const size = Math.max(1, Math.min(width, height));
  const sx = Math.floor((width - size) / 2);
  const sy = Math.floor((height - size) / 2);
  return { sx, sy, size, out: Math.min(size, maxSize) };
}
