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
