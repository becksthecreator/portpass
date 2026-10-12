import { readWeddingImage } from "@/lib/weddingImage";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

const WEDDING_ORG_SLUG = "bahamas-weddings";

async function weddingOrgId(): Promise<number | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id").eq("slug", WEDDING_ORG_SLUG).maybeSingle();
  throwIfSupabaseError(error, "Could not load the wedding organization");
  return data ? Number(data.id) : null;
}

// The photo a Wedding Desk save may write (null for none): only BWS's own,
// one shipped with the site or one uploaded to its own folder
// (lib/weddingImage.ts). Anything else throws INVALID_IMAGE, which the
// package and gallery routes answer with a 400. Called before anything is
// written.
export async function ownWeddingImageUrl(value: unknown): Promise<string | null> {
  const image = readWeddingImage(value, process.env.SUPABASE_URL);
  if (!image || (image.orgFolder !== null && image.orgFolder !== (await weddingOrgId()))) throw new Error("INVALID_IMAGE");
  return image.url;
}
