import "server-only";
import { listBusinessImages } from "@/db/business";
import { storagePathFromPublicUrl } from "@/lib/imageUpload";

// Shared by the seller's shop routes (brief 15).

export async function orgIdParam(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function positiveInt(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// A product or drop photo must be one of this business's own: a photo on
// its listing (organization_images) or a file uploaded to its folder in
// org-assets (org/{id}/...). Anything else is dropped.
export async function ownPhotosOnly(orgId: number, urls: string[]): Promise<string[]> {
  const listing = new Set((await listBusinessImages(orgId)).map((image) => image.url));
  return urls.filter((url) => listing.has(url) || (storagePathFromPublicUrl(url)?.startsWith(`org/${orgId}/`) ?? false));
}
