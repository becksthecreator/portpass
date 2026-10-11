import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { loadMoneyRows } from "@/db/ownerDashboard";
import { buildMoneyCsv, filterMoney, isMoneyFilter, isMonth } from "@/lib/ownerDashboard";
import { nassauToday } from "@/lib/futprepTerms";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";

type Ctx = { params: Promise<{ id: string }> };

// The dashboard's money table as CSV (brief 27, B), for the people who may
// handle this business's payments: the same door as every payments route.
export async function GET(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const today = nassauToday();
  const monthParam = params.get("month");
  const month = monthParam === "all" ? null : isMonth(monthParam) ? monthParam : today.slice(0, 7);
  const statusParam = params.get("status");
  const status = isMoneyFilter(statusParam) ? statusParam : "all";

  try {
    const rows = filterMoney(await loadMoneyRows(orgId, today), month, status);
    await logAudit({ actorUserId: auth.access.actor.userId, organizationId: orgId, action: "owner_dashboard.money_exported", targetTable: "payment_requests", after: { month: month ?? "all", status, rows: rows.length, by: auth.access.actor.name } });
    const slug = (auth.access.orgSlug ?? "business").replace(/[^a-z0-9-]/g, "");
    return new NextResponse(buildMoneyCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-money-${month ?? "all"}-${status}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return paymentRouteError(error, "dashboard money csv");
  }
}
