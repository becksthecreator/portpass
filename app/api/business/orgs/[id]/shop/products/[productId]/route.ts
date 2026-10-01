import { NextResponse } from "next/server";
import { deleteProduct, saveProduct } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { parseProductInput, shopErrorMessage } from "@/lib/shop/input";
import { orgIdParam, ownPhotosOnly, positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; productId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const productId = positiveInt((await ctx.params).productId);
  if (!id || !productId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const input = { ...parsed.value, photos: await ownPhotosOnly(id, parsed.value.photos) };
    return NextResponse.json(await saveProduct(id, productId, input, auth.session.userId));
  } catch (error) {
    const message = shopErrorMessage(error);
    if (message) return NextResponse.json({ error: message }, { status: message === "Not found." ? 404 : 400 });
    console.error("product save", error);
    return NextResponse.json({ error: "Could not save the product." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const productId = positiveInt((await ctx.params).productId);
  if (!id || !productId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  try {
    await deleteProduct(id, productId, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = shopErrorMessage(error);
    if (message) return NextResponse.json({ error: message }, { status: 409 });
    console.error("product delete", error);
    return NextResponse.json({ error: "Could not remove the product." }, { status: 500 });
  }
}
