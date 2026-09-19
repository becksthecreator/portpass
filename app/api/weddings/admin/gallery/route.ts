import { NextResponse } from "next/server";
import { currentWeddingStaffRole } from "@/app/weddings/staff-auth";
import { deleteWeddingGalleryImage, listAllWeddingGalleryImages, upsertWeddingGalleryImage } from "@/db/weddingSite";

export async function POST(request: Request) {
  const role = await currentWeddingStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    id?: number | null;
    imageUrl?: string;
    caption?: string;
    photographerName?: string;
    photographerUrl?: string;
    isHero?: boolean;
    visibility?: string;
    sortOrder?: number;
  };

  try {
    await upsertWeddingGalleryImage(typeof body.id === "number" ? body.id : null, {
      imageUrl: String(body.imageUrl ?? ""),
      caption: body.caption ?? null,
      photographerName: body.photographerName ?? null,
      photographerUrl: body.photographerUrl ?? null,
      isHero: body.isHero === true,
      visibility: (body.visibility as "draft" | "live") ?? "draft",
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    });
    return NextResponse.json({ images: await listAllWeddingGalleryImages() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IMAGE_URL_REQUIRED") return NextResponse.json({ error: "Add an image URL." }, { status: 400 });
    console.error("Wedding gallery save error", error);
    return NextResponse.json({ error: "Could not save the photo." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const role = await currentWeddingStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: number };
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "Invalid photo." }, { status: 400 });

  try {
    await deleteWeddingGalleryImage(Number(body.id));
    return NextResponse.json({ images: await listAllWeddingGalleryImages() });
  } catch (error) {
    console.error("Wedding gallery delete error", error);
    return NextResponse.json({ error: "Could not remove the photo." }, { status: 500 });
  }
}
