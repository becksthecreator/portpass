import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/db/supabase";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { MAX_IMAGE_UPLOAD_BYTES, ORG_ASSETS_BUCKET, sniffImage } from "@/lib/imageUpload";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

// A product photo (brief 15), stored with the business's other images
// under org/{id}/product/. Returns its public URL for the product form; the
// product save keeps only URLs in this business's own folder.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return NextResponse.json({ error: "That image is over 4 MB. Try a smaller one." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return NextResponse.json({ error: "Use a PNG, JPEG or WebP image." }, { status: 400 });

  const path = `org/${id}/product/${randomUUID()}.${type.ext}`;
  const storage = getSupabaseAdmin().storage.from(ORG_ASSETS_BUCKET);
  const { error } = await storage.upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
  if (error) {
    console.error("product photo upload", error);
    return NextResponse.json({ error: "Could not upload that image. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl }, { status: 201 });
}
