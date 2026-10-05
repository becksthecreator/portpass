import "server-only";
import { portpassFrom, sendEmail, type EmailOutcome } from "@/lib/email";
import { viaPortpassFrom } from "@/lib/paymentRequests/email";
import {
  bookingCancelledForBusinessEmail,
  bookingConfirmedEmail,
  bookingDeclinedEmail,
  bookingNewForBusinessEmail,
  bookingReceivedEmail,
  type BookingEmailFacts,
  type OwnerBookingEmail,
} from "./email";

// Who sends the booking emails (brief 19, part A). Each is recorded in the
// Messages log by sendEmail (recipient, template, outcome; never the
// text). The customer's come from "<Business> via PortPass"; the owners'
// from PortPass itself. No WhatsApp message is ever sent from here: the
// WhatsApp button on a booking opens the team member's own WhatsApp.

export async function sendBookingReceived(organizationId: number, to: string, input: BookingEmailFacts): Promise<EmailOutcome> {
  const { subject, html } = bookingReceivedEmail(input);
  return sendEmail({ to, subject, html, from: viaPortpassFrom(input.business.name), log: { template: "booking_request_received", organizationId } });
}

export async function sendBookingConfirmed(organizationId: number, to: string, input: BookingEmailFacts): Promise<EmailOutcome> {
  const { subject, html } = bookingConfirmedEmail(input);
  return sendEmail({ to, subject, html, from: viaPortpassFrom(input.business.name), log: { template: "booking_request_confirmed", organizationId } });
}

export async function sendBookingDeclined(organizationId: number, to: string, input: BookingEmailFacts & { reason: string }): Promise<EmailOutcome> {
  const { subject, html } = bookingDeclinedEmail(input);
  return sendEmail({ to, subject, html, from: viaPortpassFrom(input.business.name), log: { template: "booking_request_declined", organizationId } });
}

export async function sendBookingNewToOwners(organizationId: number, owners: string[], input: OwnerBookingEmail): Promise<void> {
  const { subject, html } = bookingNewForBusinessEmail(input);
  for (const to of owners) await sendEmail({ to, subject, html, from: portpassFrom(), log: { template: "booking_request_new_for_business", organizationId } });
}

export async function sendBookingCancelledToOwners(organizationId: number, owners: string[], input: OwnerBookingEmail): Promise<void> {
  const { subject, html } = bookingCancelledForBusinessEmail(input);
  for (const to of owners) await sendEmail({ to, subject, html, from: portpassFrom(), log: { template: "booking_request_cancelled_for_business", organizationId } });
}
