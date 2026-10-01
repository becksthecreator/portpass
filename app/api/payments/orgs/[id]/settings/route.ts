import { NextResponse } from "next/server";
import { listOwnerEmails } from "@/db/business";
import { savePaymentSettings } from "@/db/paymentRequests";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";
import { paymentErrorMessage, parseSettingsInput } from "@/lib/paymentRequests/input";
import { sendBankDetailsChangedEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

// How customers pay this business, shown on every request's page. Only the
// owner (or a PortPass platform owner) changes it -- where money is sent is
// the thing a compromised staff account must not be able to change -- and
// every change to it is logged and emailed to every owner.
export async function PUT(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  if (!auth.access.canEditSettings) return NextResponse.json({ error: "Only the owner can change how customers pay." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseSettingsInput(body);
  if (!parsed.ok) return NextResponse.json({ error: paymentErrorMessage(parsed.error), code: parsed.error }, { status: 400 });

  try {
    const { howToPayChanged } = await savePaymentSettings(orgId, parsed.value, auth.access.actor);
    if (howToPayChanged && auth.access.door === "business" && auth.access.orgSlug) {
      const owners = await listOwnerEmails(orgId).catch(() => []);
      await sendBankDetailsChangedEmail({
        to: owners,
        businessName: auth.access.orgName,
        changedBy: auth.access.actor.name,
        settingsUrl: `https://portpassbahamas.com/business/${auth.access.orgSlug}/payments/settings`,
      });
    }
    return NextResponse.json({ ok: true, howToPayChanged });
  } catch (error) {
    return paymentRouteError(error, "payment settings save");
  }
}
