import { NextResponse } from "next/server";
import { changeBookingStatus, getBookingBusiness } from "@/db/bookingRequests";
import { afterResponse } from "@/lib/afterResponse";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { cleanDeclineReason, DECLINE_REASON_MIN, isBookingAction } from "@/lib/bookings/rules";
import { sendBookingConfirmed, sendBookingDeclined } from "@/lib/bookings/send";

type Ctx = { params: Promise<{ id: string; bookingId: string }> };

const limited = createRateLimiter(120, 10 * 60_000);

// Confirm, decline, mark done or re-open one of this business's booking
// requests (brief 19, A4). Team members only; logged. Confirm emails the
// customer their confirmation and Decline emails them the reason: each is
// one person's press, never a schedule. Nothing goes by WhatsApp from
// here; the WhatsApp button on the screen opens the team member's own.
export async function PATCH(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const id = Number(params.id);
  const bookingId = Number(params.bookingId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(bookingId) || bookingId <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown } | null;
  const action = body?.action;
  if (!isBookingAction(action)) return NextResponse.json({ error: "Choose confirm, decline, done or reopen." }, { status: 400 });
  const reason = action === "decline" ? cleanDeclineReason(body?.reason) : null;
  if (action === "decline" && !reason) return NextResponse.json({ error: `Say why in a few words (at least ${DECLINE_REASON_MIN} letters). The customer is sent this.` }, { status: 400 });

  try {
    const actor = { userId: auth.session.userId, name: auth.session.profile?.fullName?.trim() || auth.session.email || "Team member" };
    const booking = await changeBookingStatus(id, bookingId, action, actor, reason);
    if (action === "confirm" || action === "decline") {
      const origin = new URL(request.url).origin;
      afterResponse(async () => {
        const business = await getBookingBusiness(id);
        if (!business) return;
        const facts = {
          business: { name: business.name, brandColor: business.brandColor, theme: business.theme },
          customerName: booking.customerName,
          referenceCode: booking.referenceCode,
          offeringName: booking.offeringName,
          requestedDate: booking.requestedDate,
          requestedTime: booking.requestedTime,
          durationOrQty: booking.durationOrQty,
          locationText: booking.locationText,
          childFirstName: booking.childFirstName,
          bookingUrl: `${origin}/booking/${booking.token}`,
        };
        if (action === "confirm") await sendBookingConfirmed(id, booking.customerEmail, facts);
        else await sendBookingDeclined(id, booking.customerEmail, { ...facts, reason: reason ?? "" });
      });
    }
    return NextResponse.json({ ok: true, status: booking.status });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (code === "CONFLICT") return NextResponse.json({ error: "This request has already changed. Refresh to see where it stands." }, { status: 409 });
    console.error("booking request status", code.slice(0, 80));
    return NextResponse.json({ error: "Could not change it." }, { status: 500 });
  }
}
