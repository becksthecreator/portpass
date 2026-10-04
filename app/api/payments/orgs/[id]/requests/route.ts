import { NextResponse } from "next/server";
import { createPaymentRequest, getPaymentSettings } from "@/db/paymentRequests";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";
import { paymentErrorMessage, parseRequestInput } from "@/lib/paymentRequests/input";
import { defaultPrefix, getPaidProblem, methodsSetUp } from "@/lib/paymentRequests/rules";

type Ctx = { params: Promise<{ id: string }> };

// New request (brief 17, §2). Saved as a draft: nothing reaches the
// customer until a person presses WhatsApp, Send by email, Copy link or
// Handed over on the next screen.
export async function POST(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const settings = await getPaymentSettings(orgId);
    // Not until the business has said how it gets paid (brief 18, E2).
    if (getPaidProblem(settings)) return NextResponse.json({ error: paymentErrorMessage("NEEDS_GET_PAID"), code: "NEEDS_GET_PAID" }, { status: 409 });
    const parsed = parseRequestInput(body, { methodsAvailable: methodsSetUp(settings) });
    if (!parsed.ok) return NextResponse.json({ error: paymentErrorMessage(parsed.error), code: parsed.error }, { status: 400 });
    const created = await createPaymentRequest(orgId, parsed.value, auth.access.actor, settings?.referencePrefix ?? defaultPrefix(auth.access.orgName));
    return NextResponse.json({ id: created.id, referenceCode: created.referenceCode }, { status: 201 });
  } catch (error) {
    return paymentRouteError(error, "payment request create");
  }
}
