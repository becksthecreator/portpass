import { NextResponse } from "next/server";
import { endPerk, publishPerk, savePerk } from "@/db/memberPerks";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { cleanPerk } from "@/lib/memberPerks";
import { bumpPerks, perkRefusal } from "@/lib/perks/server";
import { positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; perkId: string }> };

async function ids(ctx: Ctx): Promise<{ id: number; perkId: number } | null> {
  const params = await ctx.params;
  const id = positiveInt(params.id);
  const perkId = positiveInt(params.perkId);
  return id && perkId ? { id, perkId } : null;
}

function failed(error: unknown, what: string) {
  const refusal = perkRefusal(error);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  console.error(what, error instanceof Error ? error.message : "");
  return NextResponse.json({ error: "Could not save the perk." }, { status: 500 });
}

// Change a draft perk (brief 10, 6.3). Owners and admins of the business.
export async function PUT(request: Request, ctx: Ctx) {
  const found = await ids(ctx);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(found.id, "org_admin");
  if (!auth.ok) return auth.response;
  const parsed = cleanPerk(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json({ perk: await savePerk(found.id, found.perkId, parsed.value, auth.session.userId) });
  } catch (error) {
    return failed(error, "perk update");
  }
}

// Publish a draft, or end a perk. Ending stops it being offered; what
// members have already used stays on the record.
export async function POST(request: Request, ctx: Ctx) {
  const found = await ids(ctx);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(found.id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  try {
    if (body?.action === "publish") {
      const perk = await publishPerk(found.id, found.perkId, auth.session.userId);
      bumpPerks();
      return NextResponse.json({ perk });
    }
    if (body?.action === "end") {
      const perk = await endPerk(found.perkId, auth.session.userId, { organizationId: found.id });
      bumpPerks();
      return NextResponse.json({ perk });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (error) {
    return failed(error, "perk action");
  }
}
