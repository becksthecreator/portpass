import { NextResponse } from "next/server";
import { saveShop } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { parseShopInput, shopErrorMessage } from "@/lib/shop/input";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

// The shop's own settings (brief 15): reference prefix, returns policy,
// hold length, open or not. Owners and admins of the business.
export async function PUT(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseShopInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json({ shop: await saveShop(id, parsed.value, auth.session.userId) });
  } catch (error) {
    const message = shopErrorMessage(error);
    if (message) return NextResponse.json({ error: message }, { status: 400 });
    console.error("shop save", error);
    return NextResponse.json({ error: "Could not save the shop." }, { status: 500 });
  }
}
