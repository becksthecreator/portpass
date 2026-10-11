import { NextResponse } from "next/server";
import { getMarketSettings, sellerMonthFees } from "@/db/marketOrders";
import { requireAdminApi } from "@/lib/auth/admin";
import { buildCommissionCsv, isMonth } from "@/lib/market/orders";
import { positiveInt } from "@/lib/shop/server";

// One seller's commission for a month as a spreadsheet (brief 25, C5):
// ?org=<id>&month=2026-10. Each order PortPass brought and the seller
// marked paid that month, its goods total and the commission on it; it
// goes with that month's Market invoice. Admins only. The buyer's name is
// left out: the order code is enough to match it.
export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const orgId = positiveInt(params.get("org") ?? "");
  const month = params.get("month");
  if (!orgId || !isMonth(month)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [row, settings] = await Promise.all([sellerMonthFees(orgId, month), getMarketSettings()]);
  if (!row) return NextResponse.json({ error: "Nothing for that seller in that month." }, { status: 404 });
  const name = (row.slug ?? `seller-${orgId}`).replace(/[^a-z0-9-]/g, "");
  return new NextResponse(buildCommissionCsv(month, row.name, row.orders, settings.commissionBps), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-market-commission-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
