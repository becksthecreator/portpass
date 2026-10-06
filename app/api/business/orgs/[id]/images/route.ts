import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addBusinessImage, listBusinessImages, MAX_PHOTOS, removeBusinessImage, requirePhotoConsent, setBusinessHero, setBusinessLogo, setImageConsent } from "@/db/business";
import { getSupabaseAdmin } from "@/db/supabase";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { readParts, removeParts, removeStaleParts, savePart } from "@/lib/imageIncoming";
import { processUpload } from "@/lib/imageProcess";
import { chunkPosition, isUploadId, MAX_IMAGE_UPLOAD_BYTES, ORG_ASSETS_BUCKET, storagePathFromPublicUrl, UPLOAD_CHUNK_BYTES } from "@/lib/imageUpload";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = ORG_ASSETS_BUCKET;
const MAX_BYTES = MAX_IMAGE_UPLOAD_BYTES;

async function orgId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// A logo or a photo (brief 19, part E). Whatever arrives is re-made on the
// server before it is stored (lib/imageProcess.ts): resized, a HEIC
// converted, turned the right way up, and without the location and camera
// details a phone writes into a photo.
//
// A photo that fits in one request arrives whole. A bigger one (the
// browser couldn't shrink it: a 10 MB HEIC on Android, say) arrives in
// pieces with an `uploadId`, each through this same route and this same
// guard, and is put back together when the last piece lands.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "logo" ? "logo" : "photo";
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });

  const tooMany = async () => kind === "photo" && (await listBusinessImages(id)).length >= MAX_PHOTOS;
  const tooManyResponse = () => NextResponse.json({ error: `You can add up to ${MAX_PHOTOS} photos. Remove one first.` }, { status: 400 });

  let bytes: Buffer;
  const uploadId = form?.get("uploadId");
  if (uploadId !== null && uploadId !== undefined) {
    const position = chunkPosition(form?.get("index"), form?.get("total"));
    if (!isUploadId(uploadId) || !position) return NextResponse.json({ error: "That upload didn't arrive properly. Choose the photo again." }, { status: 400 });
    if (file.size === 0 || file.size > UPLOAD_CHUNK_BYTES) return NextResponse.json({ error: "That upload didn't arrive properly. Choose the photo again." }, { status: 400 });
    try {
      if (position.index === 0) {
        // Refused before anything is stored.
        if (await tooMany()) return tooManyResponse();
        await removeStaleParts(id);
      }
      await savePart(id, uploadId, position.index, Buffer.from(await file.arrayBuffer()));
      if (position.index < position.total - 1) return NextResponse.json({ received: position.index + 1, total: position.total }, { status: 202 });
      const whole = await readParts(id, uploadId, position.total);
      if (!whole) return NextResponse.json({ error: "Part of that photo didn't arrive. Choose it again." }, { status: 400 });
      bytes = whole;
    } catch (error) {
      await removeParts(id, uploadId, position.total);
      if (error instanceof Error && error.message === "IMAGE_TOO_LARGE") return NextResponse.json({ error: "That photo is over 10 MB. Try a smaller one." }, { status: 413 });
      console.error("org image pieces", error instanceof Error ? error.message.slice(0, 120) : "");
      return NextResponse.json({ error: "Could not upload that photo. Please try again." }, { status: 500 });
    } finally {
      // The pieces are only ever needed for this one request.
      if (position.index === position.total - 1) await removeParts(id, uploadId, position.total);
    }
  } else {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 4 MB. Try a smaller one." }, { status: 413 });
    bytes = Buffer.from(await file.arrayBuffer());
  }

  if (await tooMany()) return tooManyResponse();

  let made: Awaited<ReturnType<typeof processUpload>>;
  try {
    made = await processUpload(bytes, kind);
  } catch (error) {
    console.error("org image processing", error instanceof Error ? error.message.slice(0, 120) : "");
    return NextResponse.json({ error: "We couldn't read that photo. Try another one, or take a screenshot of it and upload that." }, { status: 400 });
  }
  if (!made) return NextResponse.json({ error: "Use a JPEG, PNG, WebP or HEIC photo." }, { status: 400 });
  const type = { ext: made.ext, mime: made.mime };
  bytes = made.bytes;

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
  const body = (await request.json().catch(() => ({}))) as { heroUrl?: string; imageId?: number; consentConfirmed?: boolean; childrenInPhotos?: boolean };
  // "Children appear in some of my photos": on only. From then each photo
  // is hidden until its consent is confirmed.
  if (body.childrenInPhotos !== undefined) {
    if (body.childrenInPhotos !== true) return NextResponse.json({ error: "Once this is on, only PortPass can turn it off. Email us and we will check your photos with you." }, { status: 400 });
    try {
      const business = await requirePhotoConsent(id, auth.session.userId);
      return NextResponse.json({ photoConsentRequired: business.photoConsentRequired, images: await listBusinessImages(id) });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
      throw error;
    }
  }
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
  // Only ever a file this business uploaded here (org/{id}/...).
  const path = storagePathFromPublicUrl(url, BUCKET);
  if (path && path.startsWith(`org/${id}/`)) await storage.remove([path]).catch(() => undefined);
  return NextResponse.json({ images: await listBusinessImages(id) });
}
