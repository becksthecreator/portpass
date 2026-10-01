import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { listOrgRequestPayments, listPaymentRequests } from "@/db/paymentRequests";
import { nassauLocalToIso } from "@/lib/futprepTerms";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";
import { addDays, buildPaymentsCsv, buildRequestsCsv, isIsoDate } from "@/lib/paymentRequests/rules";

type Ctx = { params: Promise<{ id: string }> };

// For the business's accountant: requests created, or payments received,
// between two Nassau dates (inclusive), as CSV.
export async function GET(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") === "payments" ? "payments" : "requests";
  const from = params.get("from");
  const to = params.get("to");
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return NextResponse.json({ error: "Pick a start and an end date." }, { status: 400 });
  const fromIso = nassauLocalToIso(`${from}T00:00`)!;
  const toIso = nassauLocalToIso(`${addDays(to, 1)}T00:00`)!;

  try {
    let csv: string;
    let count: number;
    if (kind === "payments") {
      const payments = await listOrgRequestPayments(orgId, { fromIso, toIso });
      csv = buildPaymentsCsv(payments.map((p) => ({ receiptNumber: p.receiptNumber, receivedAt: p.receivedAt, referenceCode: p.referenceCode, customerName: p.customerName, method: p.method, amountCents: p.amountCents, transferReference: p.reference, recordedBy: p.recordedBy, status: p.status, refundNote: p.refundNote })));
      count = payments.length;
    } else {
      const requests = (await listPaymentRequests(orgId)).filter((r) => r.createdAt >= fromIso && r.createdAt < toIso).reverse();
      csv = buildRequestsCsv(requests);
      count = requests.length;
    }
    await logAudit({ actorUserId: auth.access.actor.userId, organizationId: orgId, action: `payment_requests.exported`, targetTable: "payment_requests", after: { kind, from, to, rows: count, by: auth.access.actor.name } });
    const slug = (auth.access.orgSlug ?? "business").replace(/[^a-z0-9-]/g, "");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${kind}-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return paymentRouteError(error, "payment export");
  }
}
