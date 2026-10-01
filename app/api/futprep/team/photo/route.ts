import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canManageFutprepTeam, currentFutprepStaffAccount, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { listAllCoachProfiles, setCoachPhoto } from "@/db/coaches";
import { getSupabaseAdmin } from "@/db/supabase";
import { MAX_IMAGE_UPLOAD_BYTES, ORG_ASSETS_BUCKET, sniffImage, storagePathFromPublicUrl } from "@/lib/imageUpload";
import { bumpListings } from "@/lib/revalidate";

// Coach photos from the Team page (brief 16, C2): the same bucket, size
// cap and magic-byte check as the business images upload. The browser
// crops the photo square before sending it; the server never trusts the
// declared type. Admin and CEO only, like every other team edit.

// The response that refuses the request, or null when an admin or CEO is
// signed in.
async function refused(): Promise<NextResponse | null> {
  const account = await currentFutprepStaffAccount();
  const role = await currentFutprepStaffRole();
  if (!account || !role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!canManageFutprepTeam(role)) return NextResponse.json({ error: "Only an admin or CEO can manage the team." }, { status: 403 });
  return null;
}

function coachIdFrom(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function removeOurs(url: string | null) {
  const path = storagePathFromPublicUrl(url, ORG_ASSETS_BUCKET);
  if (!path) return;
  await getSupabaseAdmin().storage.from(ORG_ASSETS_BUCKET).remove([path]).catch(() => undefined);
}

export async function POST(request: Request) {
  const denied = await refused();
  if (denied) return denied;

  const form = await request.formData().catch(() => null);
  const coachId = coachIdFrom(form?.get("coachId"));
  const file = form?.get("file");
  if (!coachId) return NextResponse.json({ error: "Pick a team member." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return NextResponse.json({ error: "That image is over 4 MB. Try a smaller one." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return NextResponse.json({ error: "Use a PNG, JPEG or WebP image." }, { status: 400 });

  const path = `coach/${coachId}/${randomUUID()}.${type.ext}`;
  const storage = getSupabaseAdmin().storage.from(ORG_ASSETS_BUCKET);
  const { error: uploadError } = await storage.upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
  if (uploadError) {
    console.error("coach photo upload", uploadError);
    return NextResponse.json({ error: "Could not upload that photo. Please try again." }, { status: 500 });
  }
  const url = storage.getPublicUrl(path).data.publicUrl;

  try {
    const { previousUrl } = await setCoachPhoto(coachId, url);
    await removeOurs(previousUrl);
  } catch (error) {
    await storage.remove([path]).catch(() => undefined);
    const message = error instanceof Error ? error.message : "";
    if (message === "COACH_NOT_FOUND") return NextResponse.json({ error: "That team member no longer exists." }, { status: 404 });
    if (message === "PRIVATE_SESSIONS_MIGRATION_REQUIRED") return NextResponse.json({ error: "Run the Futprep coaches/private sessions migration first." }, { status: 503 });
    console.error("coach photo save", error);
    return NextResponse.json({ error: "Could not save that photo." }, { status: 500 });
  }
  bumpListings(); // the Futprep home grid is ISR (brief 16, C3)
  const { coaches } = await listAllCoachProfiles();
  return NextResponse.json({ ok: true, photoUrl: url, coaches }, { status: 201 });
}

export async function DELETE(request: Request) {
  const denied = await refused();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { coachId?: unknown };
  const coachId = coachIdFrom(body.coachId);
  if (!coachId) return NextResponse.json({ error: "Pick a team member." }, { status: 400 });
  try {
    const { previousUrl } = await setCoachPhoto(coachId, null);
    await removeOurs(previousUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "COACH_NOT_FOUND") return NextResponse.json({ error: "That team member no longer exists." }, { status: 404 });
    console.error("coach photo remove", error);
    return NextResponse.json({ error: "Could not remove that photo." }, { status: 500 });
  }
  bumpListings();
  const { coaches } = await listAllCoachProfiles();
  return NextResponse.json({ ok: true, coaches });
}
