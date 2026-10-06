import { chunkCount, MAX_ORIGINAL_BYTES, PHOTO_MAX_EDGE, SINGLE_UPLOAD_BYTES, UPLOAD_CHUNK_BYTES } from "@/lib/imageUpload";

// Sending a photo or a logo from a phone (brief 19, part E). Runs in the
// browser.
//
// A phone photo is 3-12 MB and one request can carry about 4. So:
//   1. the browser shrinks what it can open (a JPEG, a PNG, a WebP, and on
//      an iPhone a HEIC) to the size the page shows anyway;
//   2. if that fits in one request it goes in one;
//   3. if the browser can't open it (a HEIC on Android or a laptop) or it
//      is still too big, the original goes up in 3 MB pieces, and the
//      server converts and resizes it.
// Either way the server re-makes the picture before storing it.

type Progress = (message: string) => void;

// The photo at a web size, or null when this browser can't open the file.
async function shrinkInBrowser(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  } catch {
    return null;
  }
}

async function send<T>(endpoint: string, body: FormData): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const response = await fetch(endpoint, { method: "POST", body });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}

const TOO_BIG = "That photo is over 10 MB. Try a smaller one.";

export async function uploadImage<T>(endpoint: string, kind: "logo" | "photo", file: File, onProgress: Progress = () => undefined): Promise<T> {
  // A small file goes as it is; a logo keeps its transparency.
  let payload: Blob = file;
  if (kind === "photo" && file.size > 1_200_000) {
    onProgress("Getting the photo ready…");
    const shrunk = await shrinkInBrowser(file);
    if (shrunk && shrunk.size < file.size) payload = shrunk;
  }
  if (payload.size > MAX_ORIGINAL_BYTES) throw new Error(TOO_BIG);
  const name = file.name || "photo";

  if (payload.size <= SINGLE_UPLOAD_BYTES) {
    onProgress("Uploading…");
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", payload, name);
    const result = await send<T>(endpoint, body);
    if (!result.ok) throw new Error(result.data.error ?? (result.status === 413 ? "That image is too large to upload. Try a smaller one." : "Could not upload that image. Please try again."));
    return result.data;
  }

  // In pieces, one after another, each through PortPass's own server.
  const total = chunkCount(payload.size);
  const uploadId = crypto.randomUUID();
  for (let index = 0; index < total; index += 1) {
    onProgress(index === total - 1 ? "Finishing…" : `Uploading… ${Math.round((index / total) * 100)}%`);
    const body = new FormData();
    body.append("kind", kind);
    body.append("uploadId", uploadId);
    body.append("index", String(index));
    body.append("total", String(total));
    body.append("file", payload.slice(index * UPLOAD_CHUNK_BYTES, (index + 1) * UPLOAD_CHUNK_BYTES), name);
    const result = await send<T>(endpoint, body);
    if (!result.ok) throw new Error(result.data.error ?? "Could not upload that photo. Check your signal and try again.");
    if (index === total - 1) return result.data;
  }
  throw new Error("Could not upload that photo. Please try again.");
}
