import { NextResponse } from "next/server";
import { getDrop, releaseExpired } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { orgIdParam, positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; dropId: string }> };

// "Release now?" (brief 15): the seller confirmed the unpaid reservations
// past their hold that the list showed; each goes back to stock if it is
// still unpaid and past its hold at this moment. Nobody is messaged.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const dropId = positiveInt((await ctx.params).dropId);
  if (!id || !dropId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = (Array.isArray(body?.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  if (!ids.length) return NextResponse.json({ error: "Nothing to release." }, { status: 400 });
  if (!(await getDrop(id, dropId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const released = await releaseExpired(id, dropId, ids, auth.session.userId);
    return NextResponse.json({ released });
  } catch (error) {
    console.error("release unpaid", error);
    return NextResponse.json({ error: "Could not release those reservations." }, { status: 500 });
  }
}
