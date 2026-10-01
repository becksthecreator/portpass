import { NextResponse } from "next/server";
import { saveDrop } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { parseDropInput, shopErrorMessage } from "@/lib/shop/input";
import { orgIdParam, ownPhotosOnly, positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; dropId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const dropId = positiveInt((await ctx.params).dropId);
  if (!id || !dropId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseDropInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const hero = parsed.value.heroImageUrl ? (await ownPhotosOnly(id, [parsed.value.heroImageUrl]))[0] ?? null : null;
    const drop = await saveDrop(id, dropId, { ...parsed.value, heroImageUrl: hero }, auth.session.userId);
    return NextResponse.json({ drop });
  } catch (error) {
    const message = shopErrorMessage(error);
    if (message) return NextResponse.json({ error: message }, { status: message === "Not found." ? 404 : 400 });
    console.error("drop save", error);
    return NextResponse.json({ error: "Could not save the drop." }, { status: 500 });
  }
}
