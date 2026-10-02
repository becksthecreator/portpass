import { NextResponse } from "next/server";
import { savePerk } from "@/db/memberPerks";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { cleanPerk } from "@/lib/memberPerks";
import { perkRefusal } from "@/lib/perks/server";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

// A new member perk, saved as a draft (brief 10, 6.3). Owners and admins
// of the business. Nothing is public until it is published.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const parsed = cleanPerk(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json({ perk: await savePerk(id, null, parsed.value, auth.session.userId) }, { status: 201 });
  } catch (error) {
    const refusal = perkRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("perk create", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not save the perk." }, { status: 500 });
  }
}
