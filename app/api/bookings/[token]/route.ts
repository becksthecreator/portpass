import { NextResponse } from "next/server";
import { cancelBookingByCustomer, getBookingBusiness, isBookingToken } from "@/db/bookingRequests";
import { listOwnerEmails } from "@/db/business";
import { afterResponse } from "@/lib/afterResponse";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { sendBookingCancelledToOwners } from "@/lib/bookings/send";

// @public-route: the customer's own link is what proves who they are.

type Ctx = { params: Promise<{ token: string }> };

const limited = createRateLimiter(6, 10 * 60_000);

// The customer cancels a booking request the business hasn't answered yet
// (brief 19, A5). After that the page offers the business's contact
// details instead. The business's owners are told by email.
export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isBookingToken(token)) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (limited(`${clientIp(request)}|${token}`)) return NextResponse.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== "cancel") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const result = await cancelBookingByCustomer(token);
    if (result.outcome === "not_found") return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
    if (result.outcome === "closed") return NextResponse.json({ error: "This request has already been answered, so it can't be cancelled here. Contact the business." }, { status: 409 });
    const { booking } = result;
    const origin = new URL(request.url).origin;
    afterResponse(async () => {
      const business = await getBookingBusiness(booking.organizationId);
      if (!business) return;
      const owners = await listOwnerEmails(business.id).catch(() => [] as string[]);
      await sendBookingCancelledToOwners(business.id, owners, {
        business: { name: business.name, brandColor: business.brandColor, theme: business.theme },
        customerName: booking.customerName,
        referenceCode: booking.referenceCode,
        offeringName: booking.offeringName,
        requestedDate: booking.requestedDate,
        requestedTime: booking.requestedTime,
        durationOrQty: booking.durationOrQty,
        locationText: booking.locationText,
        childFirstName: booking.childFirstName,
        bookingsUrl: `${origin}/business/${business.slug}/bookings`,
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("booking cancel", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
