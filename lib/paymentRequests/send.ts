import "server-only";
import { logMessage } from "@/db/growth";
import { sendEmail, type EmailOutcome } from "@/lib/email";
import { paymentEmail, viaPortpassFrom, type PaymentEmailInput } from "./email";

const DETAIL: Record<EmailOutcome, string | null> = {
  sent: null,
  skipped: "Email isn't set up here, or a test address.",
  failed: "The email provider refused it.",
};

// One email for one staff member's click (brief 17): a request, a reminder
// or a receipt, from "<Business> via PortPass". Recorded in the Messages
// log (recipient, template, outcome; never the text). The caller treats
// anything but "sent" as not sent.
export async function sendPaymentEmail(organizationId: number, to: string, input: PaymentEmailInput): Promise<EmailOutcome> {
  const { subject, html } = paymentEmail(input);
  const outcome = await sendEmail({ to, subject, html, from: viaPortpassFrom(input.businessName) });
  await logMessage({ organizationId, template: `payment_${input.kind}`, recipient: to, status: outcome, detail: DETAIL[outcome] }).catch((error) => {
    console.error("payment email: messages log not written", error instanceof Error ? error.message : "");
  });
  return outcome;
}
