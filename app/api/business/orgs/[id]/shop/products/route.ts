import { NextResponse } from "next/server";
import { saveProduct } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { parseProductInput, shopErrorMessage } from "@/lib/shop/input";
import { orgIdParam, ownPhotosOnly } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const input = { ...parsed.value, photos: await ownPhotosOnly(id, parsed.value.photos) };
    const { product, blocked } = await saveProduct(id, null, input, auth.session.userId);
    return NextResponse.json({ product, blocked }, { status: 201 });
  } catch (error) {
    const message = shopErrorMessage(error);
    if (message) return NextResponse.json({ error: message }, { status: 400 });
    console.error("product create", error);
    return NextResponse.json({ error: "Could not save the product." }, { status: 500 });
  }
}
