import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { createBooking, getBookableOffering } from "@/db/bookingRequests";
import { listOwnerEmails } from "@/db/business";
import { getPaymentSettings } from "@/db/paymentRequests";
import { afterResponse } from "@/lib/afterResponse";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { parseBookingInput } from "@/lib/bookings/input";
import { sendBookingNewToOwners, sendBookingReceived } from "@/lib/bookings/send";
import { nassauToday } from "@/lib/futprepTerms";
import { defaultPrefix } from "@/lib/paymentRequests/rules";

// @public-route: asking a business for a booking needs no account.
//
// "Request to book" (brief 19, part A). The customer asks for a date on
// one of a business's priced offerings. What can be asked for is decided
// here from the database (a public business, a published offering with a
// price and no link of its own), and so is the price copied onto the
// request. Nothing is charged and nothing is booked: the business
// confirms or declines, and the customer gets one email saying the
// request arrived. No WhatsApp message is sent to anyone.

// Each request emails the address typed, so the form is limited per
// network address and per email (in memory, per server instance).
const perAddress = createRateLimiter(20, 10 * 60_000);
const perEmail = createRateLimiter(5, 10 * 60_000);

const refuse = (error: string, status = 400, field?: string) => NextResponse.json(field ? { error, field } : { error }, { status });

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["organizationSlug", "offeringSlug", "requestedDate", "requestedTime", "durationOrQty", "locationText", "notes", "customerName", "customerPhone", "customerEmail", "childFirstName", "guardianConfirmed", "attribution"]);

export async function POST(request: Request) {
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: Record<string, unknown> | null = read.value;
  if (!body) return refuse("Invalid request.");

  const typedEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim().toLowerCase().slice(0, 254) : "";
  if (perAddress(clientIp(request)) || (typedEmail && perEmail(typedEmail))) {
    return refuse("That's a lot of requests in a short time. Wait a few minutes and try again.", 429);
  }

  const organizationSlug = typeof body.organizationSlug === "string" ? body.organizationSlug.trim().slice(0, 80) : "";
  const offeringSlug = typeof body.offeringSlug === "string" ? body.offeringSlug.trim().slice(0, 80) : "";
  const found = await getBookableOffering(organizationSlug, offeringSlug).catch((error) => {
    console.error("booking request: offering lookup", error instanceof Error ? error.message : "");
    return null;
  });
  if (!found) return refuse("This can't be requested on PortPass right now.", 404);

  const parsed = parseBookingInput(body, { today: nassauToday(), forChildren: found.offering.forChildren });
  if (!parsed.ok) return refuse(parsed.error, 400, parsed.field);

  try {
    // The business's own letters if it has chosen them (Get paid), else
    // its initials: the same prefix its payment requests carry.
    const settings = await getPaymentSettings(found.business.id).catch(() => null);
    const booking = await createBooking(found, parsed.value, settings?.referencePrefix ?? defaultPrefix(found.business.name));
    const origin = new URL(request.url).origin;
    const facts = {
      business: { name: found.business.name, brandColor: found.business.brandColor, theme: found.business.theme },
      customerName: booking.customerName,
      referenceCode: booking.referenceCode,
      offeringName: booking.offeringName,
      requestedDate: booking.requestedDate,
      requestedTime: booking.requestedTime,
      durationOrQty: booking.durationOrQty,
      locationText: booking.locationText,
      childFirstName: booking.childFirstName,
    };
    afterResponse(async () => {
      await sendBookingReceived(found.business.id, booking.customerEmail, { ...facts, bookingUrl: `${origin}/booking/${booking.token}` });
      const owners = await listOwnerEmails(found.business.id).catch(() => [] as string[]);
      await sendBookingNewToOwners(found.business.id, owners, { ...facts, bookingsUrl: `${origin}/business/${found.business.slug}/bookings` });
    });
    return NextResponse.json({ referenceCode: booking.referenceCode, bookingUrl: `/booking/${booking.token}` }, { status: 201 });
  } catch (error) {
    console.error("booking request", error instanceof Error ? error.message.slice(0, 80) : "");
    return refuse("We couldn't save your request. Please try again.", 500);
  }
}
