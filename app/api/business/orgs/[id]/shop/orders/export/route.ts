import { NextResponse } from "next/server";
import { listSellerOrders } from "@/db/marketOrders";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { buildOrderPickListCsv, buildOrdersCsv } from "@/lib/market/orders";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

// The Market orders' two spreadsheets (brief 25, C4): ?kind=picklist (what
// to pack: sizes x counts over the orders still to hand over) or
// ?kind=orders (every order, one row each, with the buyer's contact for
// the seller's own use). Staff of the business only.
export async function GET(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  const kind = new URL(request.url).searchParams.get("kind") === "picklist" ? "picklist" : "orders";
  const orders = await listSellerOrders(id);
  const body = kind === "picklist" ? buildOrderPickListCsv(orders) : buildOrdersCsv(orders);
  const name = (auth.org.slug ?? `business-${id}`).replace(/[^a-z0-9-]/g, "");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-market-${kind === "picklist" ? "pick-list" : "orders"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
