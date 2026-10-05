// Booking request emails (brief 19, part A), as text: who sends them is in
// send.ts. To the customer, in the business's own colours and from
// "<Business> via PortPass": one when the request is received, and one
// when a person at the business presses Confirm or Decline. To the
// business's owners, from PortPass: one when a request arrives and one if
// the customer cancels it.
//
// The owners' emails carry the customer's name and what was asked for, and
// a link to the Bookings screen; the customer's phone, email and notes
// stay behind the business's sign-in. A child is named by first name only.
import { businessTheme } from "@/lib/businessTheme";
import { escapeHtml } from "@/lib/email";
import { formatWhen } from "./rules";

export type BookingEmailBusiness = { name: string; brandColor: string | null; theme: unknown };

export type BookingEmailFacts = {
  business: BookingEmailBusiness;
  customerName: string;
  referenceCode: string;
  offeringName: string;
  requestedDate: string;
  requestedTime: string | null;
  durationOrQty: string;
  locationText: string;
  childFirstName: string | null;
  // The customer's own page for this request.
  bookingUrl: string;
};

const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#566174;vertical-align:top">${label}</td><td style="padding:6px 0;text-align:right">${escapeHtml(value)}</td></tr>`;
}

function facts(input: BookingEmailFacts): string {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px">
        ${row("For", input.offeringName)}
        ${row("When", formatWhen(input.requestedDate, input.requestedTime))}
        ${input.durationOrQty ? row("How many / how long", input.durationOrQty) : ""}
        ${input.locationText ? row("Where", input.locationText) : ""}
        ${input.childFirstName ? row("Child", input.childFirstName) : ""}
      </table>`;
}

// The customer's emails share one frame: a band in the business's header
// colour with text that reads on it (lib/businessTheme.ts).
function customerFrame(business: BookingEmailBusiness, title: string, body: string): string {
  const theme = businessTheme(business.brandColor, business.theme);
  const name = escapeHtml(business.name);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0D1B3D">
    <div style="background:${theme.headerBg};color:${theme.headerInk};border-bottom:4px solid ${theme.headerAccent};padding:18px 20px;font-size:18px;font-weight:800">${name}</div>
    <div style="padding:20px 4px 0">
      <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
      ${body}
      <p style="color:#566174;font-size:12px;margin-top:32px">${name} · Sent via PortPass. Prices in Bahamian dollars (BSD), equal to US dollars.</p>
    </div>
  </div>`;
}

const link = (href: string, label: string) => `<p><a href="${escapeHtml(href)}" style="color:#2463AE;font-weight:700">${label} →</a></p>`;

export function bookingReceivedEmail(input: BookingEmailFacts): { subject: string; html: string } {
  const business = escapeHtml(input.business.name);
  return {
    subject: `${input.business.name}: booking request ${input.referenceCode} received`,
    html: customerFrame(input.business, "Booking request received", `
      <p>Hi ${escapeHtml(first(input.customerName))},</p>
      <p>${business} has your request. <strong>${business} will confirm within a day.</strong> Nothing is booked, and nothing is owed, until they do.</p>
      ${facts(input)}
      <p>Reference: <strong>${escapeHtml(input.referenceCode)}</strong></p>
      ${link(input.bookingUrl, "See your request, or cancel it")}`),
  };
}

export function bookingConfirmedEmail(input: BookingEmailFacts): { subject: string; html: string } {
  const business = escapeHtml(input.business.name);
  return {
    subject: `Confirmed: ${input.offeringName} with ${input.business.name}, ${formatWhen(input.requestedDate, input.requestedTime)}`,
    html: customerFrame(input.business, "Your booking is confirmed", `
      <p>Hi ${escapeHtml(first(input.customerName))},</p>
      <p>${business} has confirmed your booking.</p>
      ${facts(input)}
      <p>Reference: <strong>${escapeHtml(input.referenceCode)}</strong></p>
      <p>You pay ${business} directly. If there is something to pay, they will send you a payment request that says how; quote the reference above.</p>
      ${link(input.bookingUrl, "See your booking")}`),
  };
}

export function bookingDeclinedEmail(input: BookingEmailFacts & { reason: string }): { subject: string; html: string } {
  const business = escapeHtml(input.business.name);
  return {
    subject: `${input.business.name} can't take booking request ${input.referenceCode}`,
    html: customerFrame(input.business, "This booking can't go ahead", `
      <p>Hi ${escapeHtml(first(input.customerName))},</p>
      <p>${business} can't take your request for <strong>${escapeHtml(input.offeringName)}</strong> on ${escapeHtml(formatWhen(input.requestedDate, input.requestedTime))}.</p>
      <p style="background:#f3f5f9;border-radius:10px;padding:12px 14px">${escapeHtml(input.reason)}</p>
      <p>Nothing is owed. You're welcome to ask for another date.</p>
      ${link(input.bookingUrl, "See the request")}`),
  };
}

// ---- to the business ---------------------------------------------------------------

function ownerFrame(title: string, body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0D1B3D">
    <p style="font-size:12px;font-weight:800;letter-spacing:3px;margin:0 0 18px;color:#0D1B3D">PORTPASS</p>
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${body}
    <p style="color:#647069;font-size:12px;margin-top:32px">PortPass Bahamas Technologies · portpassbahamas.com</p>
  </div>`;
}

export type OwnerBookingEmail = Omit<BookingEmailFacts, "bookingUrl"> & { bookingsUrl: string };

export function bookingNewForBusinessEmail(input: OwnerBookingEmail): { subject: string; html: string } {
  return {
    subject: `New booking request ${input.referenceCode}: ${input.offeringName}`,
    html: ownerFrame("New booking request", `
      <p><strong>${escapeHtml(input.customerName)}</strong> has asked to book with ${escapeHtml(input.business.name)}.</p>
      ${facts({ ...input, bookingUrl: "" })}
      <p>Reference: <strong>${escapeHtml(input.referenceCode)}</strong></p>
      <p>They have been told you will confirm within a day. Their phone, email and notes are on your Bookings screen.</p>
      ${link(input.bookingsUrl, "Confirm or decline it")}`),
  };
}

export function bookingCancelledForBusinessEmail(input: OwnerBookingEmail): { subject: string; html: string } {
  return {
    subject: `Cancelled by the customer: booking request ${input.referenceCode}`,
    html: ownerFrame("A booking request was cancelled", `
      <p><strong>${escapeHtml(input.customerName)}</strong> cancelled their request for <strong>${escapeHtml(input.offeringName)}</strong> on ${escapeHtml(formatWhen(input.requestedDate, input.requestedTime))} before it was confirmed.</p>
      <p>Reference: <strong>${escapeHtml(input.referenceCode)}</strong>. There is nothing to do.</p>
      ${link(input.bookingsUrl, "Open your bookings")}`),
  };
}
