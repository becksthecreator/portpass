import { NextResponse } from "next/server";
import { getPaymentRequest, recordRequestPayment, refundRequestPayment } from "@/db/paymentRequests";
import { paymentRouteError, paymentsApiAccess, positiveId } from "@/lib/paymentRequests/access";
import { paymentErrorMessage, parseMarkPaidInput } from "@/lib/paymentRequests/input";
import { amountProblem, balanceCents } from "@/lib/paymentRequests/rules";

type Ctx = { params: Promise<{ id: string; requestId: string }> };

async function ids(ctx: Ctx) {
  const params = await ctx.params;
  return { orgId: positiveId(params.id), requestId: positiveId(params.requestId) };
}

const refuse = (code: string, status = 400) => NextResponse.json({ error: paymentErrorMessage(code), code }, { status });

// "Mark paid": the amount, method, day received and transfer reference.
// Creates a payments row with a receipt number. Only staff do this; the
// customer's "I've paid" never does.
export async function POST(request: Request, ctx: Ctx) {
  const { orgId, requestId } = await ids(ctx);
  if (!orgId || !requestId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const parsed = parseMarkPaidInput(body);
  if (!parsed.ok) return refuse(parsed.error);
  try {
    const found = await getPaymentRequest(orgId, requestId);
    if (!found) return refuse("NOT_FOUND", 404);
    if (found.request.status === "void") return refuse("VOID", 409);
    const balance = balanceCents(found.request);
    if (balance <= 0) return refuse("ALREADY_PAID", 409);
    const problem = amountProblem(parsed.value.amountCents, balance, found.request.allowPartPayment);
    if (problem) return refuse(problem);
    const result = await recordRequestPayment(orgId, requestId, parsed.value, auth.access.actor);
    return NextResponse.json({ ok: true, status: result.request.status, receiptNumber: result.receiptNumber, paymentId: result.paymentId }, { status: 201 });
  } catch (error) {
    return paymentRouteError(error, "payment request mark paid");
  }
}

// A refund: the payment stays in the history, marked refunded with a note.
export async function PATCH(request: Request, ctx: Ctx) {
  const { orgId, requestId } = await ids(ctx);
  if (!orgId || !requestId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const paymentId = Number(body?.paymentId);
  if (!body || !Number.isInteger(paymentId) || paymentId <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const updated = await refundRequestPayment(orgId, requestId, paymentId, typeof body.note === "string" ? body.note : "", auth.access.actor);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    return paymentRouteError(error, "payment request refund");
  }
}
