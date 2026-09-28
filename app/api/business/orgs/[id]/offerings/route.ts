import { NextResponse } from "next/server";
import { getBusiness, listBusinessOfferings, removeBusinessOffering, upsertBusinessOffering, type BusinessOffering } from "@/db/business";
import { getCategoryBySlug } from "@/db/categories";
import { requireOrgRoleApi } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

const PRICE_UNITS = new Set(["from", "per_session", "per_term", "per_hour", "per_day", "per_person"]);

async function orgId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

// The offering type follows the subcategory's template (program / service
// / event / venue), so the page structure always follows the template
// system; nobody picks a layout.
async function offeringTypeFor(id: number): Promise<BusinessOffering["type"]> {
  const business = await getBusiness(id);
  const slug = business?.subcategory ?? business?.primaryCategory ?? null;
  const category = slug ? await getCategoryBySlug(slug).catch(() => null) : null;
  const template = category?.template;
  return template === "program" || template === "event" || template === "venue" ? template : "service";
}

async function save(request: Request, ctx: Ctx, offeringId: number | null) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const name = str(body, "name", 120);
  if (!name) return NextResponse.json({ error: "Give the offering a name." }, { status: 400 });

  let priceCents: number | null = null;
  if (body.price !== undefined && body.price !== null && body.price !== "") {
    const dollars = Number(String(body.price).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) return NextResponse.json({ error: "Enter a price in dollars, or leave it blank to save a draft." }, { status: 400 });
    priceCents = Math.round(dollars * 100);
  }
  const priceUnit = str(body, "priceUnit", 20);
  if (priceCents !== null && priceUnit && !PRICE_UNITS.has(priceUnit)) return NextResponse.json({ error: "Choose a valid price unit." }, { status: 400 });
  const capacityRaw = body.capacity;
  const capacity = capacityRaw === undefined || capacityRaw === null || capacityRaw === "" ? null : Number(capacityRaw);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) return NextResponse.json({ error: "Capacity must be a whole number." }, { status: 400 });

  try {
    const offering = await upsertBusinessOffering(
      id,
      offeringId,
      {
        name,
        summary: str(body, "summary", 400) || null,
        priceCents,
        priceUnit: priceCents !== null ? priceUnit || null : null,
        scheduleText: str(body, "duration", 160) || null,
        capacity,
        type: await offeringTypeFor(id),
      },
      auth.session.userId,
    );
    return NextResponse.json({ offering, offerings: await listBusinessOfferings(id) }, { status: offeringId === null ? 201 : 200 });
  } catch (error) {
    console.error("offering save", error);
    return NextResponse.json({ error: "Could not save that offering." }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  return save(request, ctx, null);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const clone = request.clone();
  const body = (await clone.json().catch(() => ({}))) as { id?: number };
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "Invalid offering." }, { status: 400 });
  return save(request, ctx, Number(body.id));
}

export async function DELETE(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "Invalid offering." }, { status: 400 });
  await removeBusinessOffering(id, Number(body.id), auth.session.userId);
  return NextResponse.json({ offerings: await listBusinessOfferings(id) });
}
