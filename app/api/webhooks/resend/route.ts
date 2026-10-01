import { NextResponse } from "next/server";
import { markDelivery } from "@/db/adminHealth";
import { deliveryFromEvent, verifyResendSignature } from "@/lib/resendWebhook";

export const dynamic = "force-dynamic";

// The email service reports what happened to each email here (brief 08,
// 1.10: "sent / bounced", so "I never got it" can be answered). Open to the
// internet by necessity, so every call must carry the service's signature
// (lib/resendWebhook.ts); without RESEND_WEBHOOK_SECRET set, nothing is
// accepted at all. It only ever changes the status of an email PortPass
// already logged as sent.
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not set up." }, { status: 503 });
  const body = await request.text();
  if (body.length > 200_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const signed = verifyResendSignature({ secret, id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"), body });
  if (!signed) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const delivery = deliveryFromEvent(event);
  if (!delivery) return NextResponse.json({ ok: true });
  try {
    await markDelivery(delivery.providerId, delivery.status, delivery.detail);
  } catch (error) {
    // A 500 makes the service try again later.
    console.error("resend webhook", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
