import "server-only";
import { getSupabaseAdmin } from "@/db/supabase";
import { INCOMING_BUCKET, incomingPartPath, MAX_ORIGINAL_BYTES } from "./imageUpload";

// The pieces of a photo too big for one request (brief 19, part E), kept
// in a private bucket only the server can read until the last one
// arrives. Every path is under org/{id}/incoming/{upload id}/, so one
// business's pieces can never be read or completed by another: the route
// has already checked the caller belongs to {id}.

const bucket = () => getSupabaseAdmin().storage.from(INCOMING_BUCKET);

export async function savePart(organizationId: number, uploadId: string, index: number, bytes: Buffer): Promise<void> {
  const { error } = await bucket().upload(incomingPartPath(organizationId, uploadId, index), bytes, { contentType: "application/octet-stream", upsert: true });
  if (error) throw new Error(`INCOMING_SAVE_FAILED: ${error.message}`);
}

// The whole file, in order. null when a piece is missing (the upload was
// cut short): the caller asks for the photo again.
export async function readParts(organizationId: number, uploadId: string, total: number): Promise<Buffer | null> {
  const parts: Buffer[] = [];
  let size = 0;
  for (let index = 0; index < total; index += 1) {
    const { data, error } = await bucket().download(incomingPartPath(organizationId, uploadId, index));
    if (error || !data) return null;
    const part = Buffer.from(await data.arrayBuffer());
    size += part.length;
    if (size > MAX_ORIGINAL_BYTES) throw new Error("IMAGE_TOO_LARGE");
    parts.push(part);
  }
  return Buffer.concat(parts);
}

export async function removeParts(organizationId: number, uploadId: string, total: number): Promise<void> {
  const paths = Array.from({ length: total }, (_, index) => incomingPartPath(organizationId, uploadId, index));
  await bucket().remove(paths).catch(() => undefined);
}

const STALE_AFTER_MS = 60 * 60 * 1000;

// Pieces of uploads that were never finished (a closed tab, a lost
// signal) are removed the next time this business starts one. Best
// effort: a failure here never stops an upload.
export async function removeStaleParts(organizationId: number, now: number = Date.now()): Promise<void> {
  try {
    const root = `org/${organizationId}/incoming`;
    const { data: uploads } = await bucket().list(root, { limit: 100 });
    for (const upload of uploads ?? []) {
      const prefix = `${root}/${upload.name}`;
      const { data: parts } = await bucket().list(prefix, { limit: 20 });
      if (!parts || parts.length === 0) continue;
      const newest = Math.max(...parts.map((part) => Date.parse(part.updated_at ?? part.created_at ?? "") || 0));
      if (now - newest > STALE_AFTER_MS) await bucket().remove(parts.map((part) => `${prefix}/${part.name}`));
    }
  } catch {
    // Left for next time.
  }
}
