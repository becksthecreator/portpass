import { NextResponse } from "next/server";
import { createDraftBusiness, findDraftForUser } from "@/db/business";
import { getCategoryBySlug, isKnownSectionSlug } from "@/db/categories";
import { requireSignedInApi } from "@/lib/auth/guards";

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

// Starts a business for the signed-in person (they become its owner). One
// unfinished draft at a time: a second call while one exists just returns
// the existing draft.
export async function POST(request: Request) {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const existing = await findDraftForUser(auth.session.userId);
  if (existing) return NextResponse.json({ id: existing.id, slug: existing.slug, existing: true });

  const name = str(body, "name", 150);
  const section = str(body, "section", 40);
  const subcategory = str(body, "subcategory", 60) || null;
  if (!name) return NextResponse.json({ error: "Give your business a name." }, { status: 400 });
  if (!(await isKnownSectionSlug(section))) return NextResponse.json({ error: "Choose a section." }, { status: 400 });
  if (subcategory) {
    const cat = await getCategoryBySlug(subcategory).catch(() => null);
    const parent = cat?.parentId ? await getCategoryBySlug(section) : null;
    if (!cat || !parent || cat.parentId !== parent.id) return NextResponse.json({ error: "Choose a subcategory from that section." }, { status: 400 });
  }

  try {
    const business = await createDraftBusiness({ name, section, subcategory, ownerUserId: auth.session.userId, actorUserId: auth.session.userId });
    return NextResponse.json({ id: business.id, slug: business.slug, existing: false }, { status: 201 });
  } catch (error) {
    console.error("business create", error);
    return NextResponse.json({ error: "Could not start your business page. Please try again." }, { status: 500 });
  }
}
