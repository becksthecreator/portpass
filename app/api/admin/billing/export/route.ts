import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { billingExport } from "@/db/billing";
import { logAudit } from "@/db/audit";
import { csvCell } from "@/lib/adminBookings";
import { INVOICE_STATUS_LABEL, isDay, RECEIPT_METHOD_LABEL } from "@/lib/billing";

const limited = createRateLimiter(20, 10 * 60_000);

const dollars = (cents: number) => (cents / 100).toFixed(2);

// Admin -> Billing: invoices or receipts in a date range, as a CSV for the
// accountant (brief 09, 2.4). Logged.
export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  // An export is logged in the founder's name, so it must be their own
  // click on our own page: a link on another site can't trigger one.
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many exports in a short time. Try again in a few minutes." }, { status: 429 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const what = params.get("what") === "receipts" ? "receipts" : "invoices";
  if (!isDay(from) || !isDay(to) || to < from) return NextResponse.json({ error: "Choose a start date and an end date." }, { status: 400 });
  try {
    const { invoices, receipts } = await billingExport(from, to);
    const rows =
      what === "invoices"
        ? [["Invoice", "Business", "Issued", "Due", "Period start", "Period end", "Status", "Subtotal (BSD)", "VAT (BSD)", "Total (BSD)", "Received (BSD)", "Sent via", "Void reason"], ...invoices.map((i) => [i.number, i.organizationName, i.issuedOn, i.dueOn, i.periodStart, i.periodEnd, INVOICE_STATUS_LABEL[i.status], dollars(i.subtotalCents), dollars(i.vatCents), dollars(i.totalCents), dollars(i.paidCents), i.sentVia, i.voidReason])]
        : [["Received on", "Business", "Invoice", "Amount (BSD)", "Method", "Reference", "Note"], ...receipts.map((r) => [r.receivedOn, r.organizationName, r.invoiceNumber, dollars(r.amountCents), RECEIPT_METHOD_LABEL[r.method], r.reference, r.note])];
    await logAudit({ actorUserId: auth.session.userId, action: "billing.exported", targetTable: what === "invoices" ? "portpass_invoices" : "portpass_receipts", after: { from, to, rows: rows.length - 1 } });
    // An amount stays a number, credits included: only free text gets the
    // guard that stops a spreadsheet reading it as a formula.
    const csv = rows.map((row) => row.map((cell) => (typeof cell === "string" && /^-?\d+\.\d{2}$/.test(cell) ? cell : csvCell(cell ?? null))).join(",")).join("\r\n") + "\r\n";
    return new NextResponse(`﻿${csv}`, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="portpass-${what}-${from}-to-${to}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin billing export", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not make the export." }, { status: 500 });
  }
}
