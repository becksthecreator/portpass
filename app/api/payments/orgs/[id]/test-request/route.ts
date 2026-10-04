import { NextResponse } from "next/server";
import { createTestRequest, markPaymentRequestSent } from "@/db/paymentRequests";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";
import { paymentErrorMessage } from "@/lib/paymentRequests/input";
import { sendPaymentEmail } from "@/lib/paymentRequests/send";
import { balanceCents, defaultPrefix, payPath } from "@/lib/paymentRequests/rules";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(5, 10 * 60_000);

// "Send yourself a test request" (brief 18, E3). One request, marked TEST,
// emailed to the signed-in person's own account email and to nobody else:
// the address comes from the session, never from the request. It is never
// money (the database refuses any payment against it). An open test
// request is reused, so pressing twice doesn't make two.
export async function POST(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  const { access } = auth;
  const email = access.actorEmail;
  if (!email) return NextResponse.json({ error: paymentErrorMessage("NO_OWN_EMAIL"), code: "NO_OWN_EMAIL" }, { status: 400 });
  if (limited(`${orgId}:${email}`)) return NextResponse.json({ error: "Too many test requests in a row. Wait a few minutes." }, { status: 429 });

  try {
    const req = await createTestRequest(orgId, { name: access.actor.name, email }, access.actor, defaultPrefix(access.orgName));
    const origin = new URL(request.url).origin;
    const payUrl = `${origin}${payPath(req.publicToken)}`;
    let emailed = false;
    if (req.status === "draft") {
      const outcome = await sendPaymentEmail(orgId, email, {
        kind: "request",
        businessName: access.orgName,
        customerName: req.customerName,
        referenceCode: req.referenceCode,
        lines: req.lines,
        totalCents: req.totalCents,
        paidCents: req.paidCents,
        balanceCents: balanceCents(req),
        dueDate: req.dueDate,
        payUrl,
      });
      emailed = outcome === "sent";
      // Sent either way: the owner has the link on this screen even when
      // the email could not go out.
      await markPaymentRequestSent(orgId, req.id, emailed ? "email" : "link", access.actor);
    } else {
      emailed = req.sentVia === "email";
    }
    return NextResponse.json({ ok: true, id: req.id, referenceCode: req.referenceCode, payUrl, email, emailed }, { status: 201 });
  } catch (error) {
    return paymentRouteError(error, "payment test request");
  }
}
