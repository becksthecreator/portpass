import { NextResponse } from "next/server";
import { countPaymentRequests, createPaymentRequest, getPaymentSettings, prefillFromRegistration } from "@/db/paymentRequests";
import { requireDemoApi } from "@/lib/auth/demo";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { nassauToday } from "@/lib/futprepTerms";
import { DEMO_ACTOR, paymentRouteError } from "@/lib/paymentRequests/access";
import { addDays, defaultPrefix, methodsSetUp } from "@/lib/paymentRequests/rules";

const limited = createRateLimiter(40, 10 * 60_000);
// The demo is put back every night; until then it can't grow without end.
const DEMO_REQUEST_CAP = 80;

// "Request payment" in the demo (brief 18, part B): a request made from
// one of the demo's registrations. Who it is for and what it is for come
// from that registration, never from anything the visitor typed, so no
// real person's name or number can be put into the demo.
export async function POST(request: Request) {
  const auth = await requireDemoApi();
  if (!auth.ok) return auth.response;
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many requests in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { registrationId?: unknown } | null;
  const registrationId = Number(body?.registrationId);
  if (!Number.isInteger(registrationId) || registrationId <= 0) return NextResponse.json({ error: "Choose a registration." }, { status: 400 });

  try {
    const prefill = await prefillFromRegistration(auth.org.id, registrationId);
    if (!prefill) return NextResponse.json({ error: "Not found." }, { status: 404 });
    // One open request for a registration: a second press opens the first.
    if (prefill.openRequests.length > 0) return NextResponse.json({ id: prefill.openRequests[0].id, existing: true });
    if (prefill.lines.length === 0) return NextResponse.json({ error: "Nothing is owing on this registration." }, { status: 409 });
    if ((await countPaymentRequests(auth.org.id)) >= DEMO_REQUEST_CAP) return NextResponse.json({ error: "The demo has all the requests it can hold. It is put back to its starting point tonight." }, { status: 409 });

    const settings = await getPaymentSettings(auth.org.id);
    const methods = methodsSetUp(settings);
    if (methods.length === 0) return NextResponse.json({ error: "The demo isn't ready. Try again in a moment." }, { status: 409 });
    const created = await createPaymentRequest(
      auth.org.id,
      {
        customerName: prefill.customer.name,
        customerEmail: prefill.customer.email,
        customerPhone: prefill.customer.phone,
        personId: null,
        lines: prefill.lines,
        totalCents: prefill.lines.reduce((sum, line) => sum + line.qty * line.unitCents, 0),
        dueDate: addDays(nassauToday(), settings?.defaultDueDays ?? 7),
        allowPartPayment: true,
        methods,
        offeringId: null,
        registrationId,
        privateSessionRequestId: null,
        reservationId: null,
      },
      DEMO_ACTOR,
      settings?.referencePrefix ?? defaultPrefix(auth.org.name),
    );
    return NextResponse.json({ id: created.id, referenceCode: created.referenceCode }, { status: 201 });
  } catch (error) {
    return paymentRouteError(error, "demo payment request");
  }
}
