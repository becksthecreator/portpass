import "server-only";
import { sendEmail, type EmailOutcome } from "@/lib/email";
import { paymentEmail, viaPortpassFrom, type PaymentEmailInput } from "./email";

// One email for one staff member's click (brief 17): a request, a reminder
// or a receipt, from "<Business> via PortPass". Recorded in the Messages
// log by sendEmail itself (recipient, template, outcome and the email
// service's id, so a bounce shows up later; never the text). The caller
// treats anything but "sent" as not sent.
export async function sendPaymentEmail(organizationId: number, to: string, input: PaymentEmailInput): Promise<EmailOutcome> {
  const { subject, html } = paymentEmail(input);
  return sendEmail({ to, subject, html, from: viaPortpassFrom(input.businessName), log: { template: `payment_${input.kind}`, organizationId } });
}
