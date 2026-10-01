import { NextResponse } from "next/server";
import { setLicenceApproval } from "@/db/shop";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ productId: string }> };

// §5 marks and crests (brief 15): a product using another organisation's
// crest, logo or official kit design is published only after a platform
// owner approves its licence note. Withdrawing also unpublishes it.
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_owner")) return NextResponse.json({ error: "Only a platform owner can approve a licence." }, { status: 403 });
  const productId = positiveInt((await ctx.params).productId);
  if (!productId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { approve?: unknown } | null;
  if (typeof body?.approve !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await setLicenceApproval(productId, body.approve, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (message === "NEEDS_LICENCE_NOTE") return NextResponse.json({ error: "The seller hasn't written the licence note yet." }, { status: 400 });
    console.error("licence decision", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
