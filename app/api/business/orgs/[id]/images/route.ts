import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addBusinessImage, listBusinessImages, MAX_PHOTOS, removeBusinessImage, setBusinessHero, setBusinessLogo, setImageConsent } from "@/db/business";
import { getSupabaseAdmin } from "@/db/supabase";
import { requireOrgRoleApi } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = "org-assets";
// Vercel's request body limit is 4.5 MB; the wizard downscales client-side
// before upload, so this is a backstop, not the normal path.
const MAX_BYTES = 4 * 1024 * 1024;

async function orgId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Declared MIME types are whatever the browser says; the bytes are what
// counts.
function sniff(bytes: Buffer): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: string } | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function POST(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "logo" ? "logo" : "photo";
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 4 MB. Try a smaller one." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return NextResponse.json({ error: "Use a PNG, JPEG or WebP image." }, { status: 400 });

  if (kind === "photo" && (await listBusinessImages(id)).length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `You can add up to ${MAX_PHOTOS} photos. Remove one first.` }, { status: 400 });
  }

  const path = `org/${id}/${kind}/${randomUUID()}.${type.ext}`;
  const storage = getSupabaseAdmin().storage.from(BUCKET);
  const { error: uploadError } = await storage.upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
  if (uploadError) {
    console.error("org-assets upload", uploadError);
    return NextResponse.json({ error: "Could not upload that image. Please try again." }, { status: 500 });
  }
  const url = storage.getPublicUrl(path).data.publicUrl;

  try {
    if (kind === "logo") {
      await setBusinessLogo(id, url);
      return NextResponse.json({ logoUrl: url });
    }
    const image = await addBusinessImage(id, url, (form?.get("alt") as string | null) || null);
    return NextResponse.json({ image, images: await listBusinessImages(id) }, { status: 201 });
  } catch (error) {
    await storage.remove([path]).catch(() => undefined);
    if (error instanceof Error && error.message === "TOO_MANY_PHOTOS") return NextResponse.json({ error: `You can add up to ${MAX_PHOTOS} photos.` }, { status: 400 });
    console.error("org image save", error);
    return NextResponse.json({ error: "Could not save that image." }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { heroUrl?: string; imageId?: number; consentConfirmed?: boolean };
  // Per-photo consent: the owner states the signed forms exist for every
  // child in the photo. Audit-logged in db/business.ts.
  if (typeof body.consentConfirmed === "boolean") {
    if (!Number.isInteger(body.imageId)) return NextResponse.json({ error: "Invalid photo." }, { status: 400 });
    try {
      return NextResponse.json({ images: await setImageConsent(id, Number(body.imageId), body.consentConfirmed, auth.session.userId) });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Invalid photo." }, { status: 404 });
      throw error;
    }
  }
  const images = await listBusinessImages(id);
  const hero = images.find((i) => i.url === body.heroUrl);
  if (!hero) return NextResponse.json({ error: "Pick one of your uploaded photos." }, { status: 400 });
  await setBusinessHero(id, hero.url);
  return NextResponse.json({ heroImageUrl: hero.url });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { imageId?: number; logo?: boolean };
  const storage = getSupabaseAdmin().storage.from(BUCKET);
  if (body.logo) {
    await setBusinessLogo(id, null);
    return NextResponse.json({ ok: true });
  }
  if (!Number.isInteger(body.imageId)) return NextResponse.json({ error: "Invalid photo." }, { status: 400 });
  const url = await removeBusinessImage(id, Number(body.imageId));
  const marker = `/object/public/${BUCKET}/`;
  if (url && url.includes(marker)) await storage.remove([url.slice(url.indexOf(marker) + marker.length)]).catch(() => undefined);
  return NextResponse.json({ images: await listBusinessImages(id) });
}
