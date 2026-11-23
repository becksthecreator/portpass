import "server-only";
import path from "node:path";
import { getSupabaseAdmin } from "@/db/supabase";

// The Futprep look book, draft 1, made by PortPass Site Design (20 Nov 2026):
// index.html plus assets/ (CSS, plain scripts, Alex's own kit photos and
// layout studies). This repo is public, so the book is NEVER committed here
// (not even under a "private" folder: anyone can read the repo). It lives
// in a private Supabase Storage bucket that only the server can read, put
// there by hand by a founder:
//
//   bucket  lookbooks           (private, created in the Supabase dashboard)
//   folder  futprep-draft1/     index.html, assets/book.css, assets/img/...
//
// Rules for anything uploaded there: no children's names, photos, health,
// pickup or emergency details (CLAUDE.md rule 3), no unconfirmed prices,
// nothing saying card payments work.

export const LOOKBOOKS_BUCKET = "lookbooks";
export const FUTPREP_LOOKBOOK_FOLDER = "futprep-draft1";

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

async function download(key: string): Promise<Buffer | null> {
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(LOOKBOOKS_BUCKET).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    console.error("lookbook: storage read failed", error instanceof Error ? error.message : "");
    return null;
  }
}

export async function readLookbookPage(): Promise<string | null> {
  const body = await download(`${FUTPREP_LOOKBOOK_FOLDER}/index.html`);
  if (!body) console.error("lookbook: index.html not found in storage");
  return body ? body.toString("utf8") : null;
}

// One file under assets/, by its path below assets/ ("img/kit/today-1.jpg").
// Only plain names and known file types; nothing can name a file outside
// the look book's own assets folder.
export function lookbookAssetKey(parts: string[]): { key: string; type: string } | null {
  if (parts.length === 0 || parts.length > 4) return null;
  if (!parts.every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(part) && !part.includes(".."))) return null;
  const type = TYPES[path.extname(parts[parts.length - 1]).toLowerCase()];
  if (!type) return null;
  return { key: `${FUTPREP_LOOKBOOK_FOLDER}/assets/${parts.join("/")}`, type };
}

export async function readLookbookAsset(parts: string[]): Promise<{ body: Buffer; type: string } | null> {
  const asset = lookbookAssetKey(parts);
  if (!asset) return null;
  const body = await download(asset.key);
  return body ? { body, type: asset.type } : null;
}
