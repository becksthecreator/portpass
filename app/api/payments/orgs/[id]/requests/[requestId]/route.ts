import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import {
  clearCustomerSaysPaid,
  getPaymentRequest,
  getPaymentSettings,
  markPaymentRequestSent,
  recordReminder,
  updatePaymentRequest,
  voidPaymentRequest,
  type PaymentRequest,
} from "@/db/paymentRequests";
import { paymentRouteError, paymentsApiAccess, positiveId } from "@/lib/paymentRequests/access";
import { sendPaymentEmail, type PaymentEmailKind } from "@/lib/paymentRequests/email";
import { paymentErrorMessage, parseReminderVia, parseRequestInput, parseSentVia } from "@/lib/paymentRequests/input";
import { balanceCents, methodsSetUp, payPath, receiptPath } from "@/lib/paymentRequests/rules";

type Ctx = { params: Promise<{ id: string; requestId: string }> };

async function ids(ctx: Ctx) {
  const params = await ctx.params;
  return { orgId: positiveId(params.id), requestId: positiveId(params.requestId) };
}

const refuse = (code: string, status = 400) => NextResponse.json({ error: paymentErrorMessage(code), code }, { status });

// Change a request (until money is recorded against it).
export async function PATCH(request: Request, ctx: Ctx) {
  const { orgId, requestId } = await ids(ctx);
  if (!orgId || !requestId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const current = await getPaymentRequest(orgId, requestId);
    if (!current) return refuse("NOT_FOUND", 404);
    const settings = await getPaymentSettings(orgId);
    // A method already on the request stays allowed even if its details
    // have since been removed from Settings.
    const available = [...new Set([...methodsSetUp(settings), ...current.request.methods])];
    const parsed = parseRequestInput(body, { methodsAvailable: available, existingDueDate: current.request.dueDate });
    if (!parsed.ok) return refuse(parsed.error);
    const updated = await updatePaymentRequest(orgId, requestId, parsed.value, auth.access.actor);
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return paymentRouteError(error, "payment request edit");
  }
}

function emailFor(kind: PaymentEmailKind, req: PaymentRequest, businessName: string, origin: string, receipt?: { number: string; amountCents: number }) {
  return {
    kind,
    businessName,
    customerName: req.customerName,
    referenceCode: req.referenceCode,
    lines: req.lines,
    totalCents: req.totalCents,
    paidCents: req.paidCents,
    balanceCents: balanceCents(req),
    dueDate: req.dueDate,
    payUrl: `${origin}${payPath(req.publicToken)}`,
    receipt: receipt && { ...receipt, url: `${origin}${receiptPath(req.publicToken, receipt.number)}` },
  };
}

// Everything a person does to a request after creating it. Every message
// goes out because a person pressed a button: WhatsApp is a wa.me link the
// staff member sends themselves; an email is one email, now.
export async function POST(request: Request, ctx: Ctx) {
  const { orgId, requestId } = await ids(ctx);
  if (!orgId || !requestId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { actor, orgName } = auth.access;
  const origin = new URL(request.url).origin;

  try {
    const found = await getPaymentRequest(orgId, requestId);
    if (!found) return refuse("NOT_FOUND", 404);
    const req = found.request;

    switch (body.action) {
      case "send": {
        const via = parseSentVia(body.via);
        if (!via) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
        if (req.status === "void") return refuse("VOID", 409);
        if (via === "email") {
          if (!req.customerEmail) return refuse("NO_EMAIL");
          const outcome = await sendPaymentEmail(req.customerEmail, emailFor("request", req, orgName, origin));
          if (outcome !== "sent") return refuse("EMAIL_FAILED", 502);
        }
        const sent = await markPaymentRequestSent(orgId, requestId, via, actor);
        return NextResponse.json({ ok: true, status: sent.status });
      }
      case "remind": {
        const via = parseReminderVia(body.via);
        if (!via) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
        if (req.status !== "sent" && req.status !== "part_paid") return refuse(req.status === "paid" ? "ALREADY_PAID" : req.status === "void" ? "VOID" : "NOT_SENT_YET", 409);
        if (via === "email") {
          if (!req.customerEmail) return refuse("NO_EMAIL");
          const outcome = await sendPaymentEmail(req.customerEmail, emailFor("reminder", req, orgName, origin));
          if (outcome !== "sent") return refuse("EMAIL_FAILED", 502);
        }
        const reminded = await recordReminder(orgId, requestId, via, actor);
        return NextResponse.json({ ok: true, lastRemindedAt: reminded.lastRemindedAt });
      }
      case "email_receipt": {
        const payment = found.payments.find((p) => p.id === Number(body.paymentId) && p.status === "received" && p.receiptNumber);
        if (!payment) return refuse("NOT_FOUND", 404);
        if (!req.customerEmail) return refuse("NO_EMAIL");
        const outcome = await sendPaymentEmail(req.customerEmail, emailFor("receipt", req, orgName, origin, { number: payment.receiptNumber!, amountCents: payment.amountCents }));
        if (outcome !== "sent") return refuse("EMAIL_FAILED", 502);
        await logAudit({ actorUserId: actor.userId, organizationId: orgId, action: "payment_request.receipt_emailed", targetTable: "payment_requests", targetId: requestId, after: { reference: req.referenceCode, receipt: payment.receiptNumber, by: actor.name } });
        return NextResponse.json({ ok: true });
      }
      case "void": {
        const reason = typeof body.reason === "string" ? body.reason : "";
        const voided = await voidPaymentRequest(orgId, requestId, reason, actor);
        return NextResponse.json({ ok: true, status: voided.status });
      }
      case "clear_flag": {
        await clearCustomerSaysPaid(orgId, requestId, actor);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
  } catch (error) {
    return paymentRouteError(error, "payment request action");
  }
}
