import { NextResponse } from "next/server";
import { getDrop, listDropReservations } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { buildPickListCsv, buildReservationsCsv } from "@/lib/shop/rules";
import { orgIdParam, positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; dropId: string }> };

// The drop's two spreadsheets (brief 15): ?kind=picklist (sizes x counts,
// what to pack) or ?kind=reservations (every reservation, one row each).
export async function GET(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const dropId = positiveInt((await ctx.params).dropId);
  if (!id || !dropId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  const drop = await getDrop(id, dropId);
  if (!drop) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const kind = new URL(request.url).searchParams.get("kind") === "picklist" ? "picklist" : "reservations";
  const reservations = await listDropReservations(id, dropId);
  const body = kind === "picklist" ? buildPickListCsv(reservations) : buildReservationsCsv(reservations);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${drop.slug}-${kind === "picklist" ? "pick-list" : "reservations"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
