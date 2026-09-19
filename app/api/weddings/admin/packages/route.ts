import { NextResponse } from "next/server";
import { currentWeddingStaffRole } from "@/app/weddings/staff-auth";
import { listAllWeddingPackages, upsertWeddingPackage } from "@/db/weddingPackages";

export async function POST(request: Request) {
  const role = await currentWeddingStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    id?: number | null;
    slug?: string;
    name?: string;
    tagline?: string;
    description?: string;
    includes?: string[];
    priceDollars?: number | null;
    priceNote?: string;
    visibility?: string;
    sortOrder?: number;
  };

  const priceFromCents = typeof body.priceDollars === "number" && Number.isFinite(body.priceDollars)
    ? Math.round(body.priceDollars * 100)
    : null;

  try {
    await upsertWeddingPackage(typeof body.id === "number" ? body.id : null, {
      slug: String(body.slug ?? ""),
      name: String(body.name ?? ""),
      tagline: body.tagline ?? null,
      description: body.description ?? null,
      includes: Array.isArray(body.includes) ? body.includes.filter((v): v is string => typeof v === "string") : [],
      priceFromCents,
      priceNote: body.priceNote ?? null,
      visibility: (body.visibility as "draft" | "unlisted" | "live") ?? "draft",
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    });
    return NextResponse.json({ packages: await listAllWeddingPackages() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_SLUG") return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens." }, { status: 400 });
    if (message === "NAME_REQUIRED") return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    if (message === "INVALID_PRICE") return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
    console.error("Wedding package save error", error);
    return NextResponse.json({ error: "Could not save the package." }, { status: 500 });
  }
}
