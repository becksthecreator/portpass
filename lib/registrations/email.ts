import "server-only";
import { escapeHtml, sendEmail, type EmailOutcome } from "@/lib/email";
import { businessTheme } from "@/lib/businessTheme";
import { viaPortpassFrom } from "@/lib/paymentRequests/email";

// "Registration received" for any business (brief 18, D2), in that
// business's own colours: a header band in its header colour with text
// that reads on it (lib/businessTheme.ts). From "<Business> via PortPass".
// It says what was registered for and what is owed. It never carries a
// health, emergency or pickup detail, and names a child by first name only.

export type RegistrationEmailInput = {
  organizationId: number;
  business: { name: string; brandColor: string | null; theme: unknown };
  to: string;
  registrantName: string;
  // null when the registrant is the participant (an adult's own registration).
  childFirstName: string | null;
  what: string;
  when: string;
  location: string;
  amountDueCents: number;
  referenceCode: string;
  accountUrl: string;
};

const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;

export function registrationReceivedEmail(input: RegistrationEmailInput): { subject: string; html: string } {
  const theme = businessTheme(input.business.brandColor, input.business.theme);
  const business = escapeHtml(input.business.name);
  const who = input.childFirstName ? `the registration for <strong>${escapeHtml(input.childFirstName)}</strong>` : "your registration";
  const row = (label: string, value: string) => `<tr><td style="padding:6px 0;color:#566174">${label}</td><td style="padding:6px 0;text-align:right">${escapeHtml(value)}</td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0D1B3D">
    <div style="background:${theme.headerBg};color:${theme.headerInk};border-bottom:4px solid ${theme.headerAccent};padding:18px 20px;font-size:18px;font-weight:800">${business}</div>
    <div style="padding:20px 4px 0">
      <h1 style="font-size:22px;margin:0 0 16px">Registration received</h1>
      <p>Hi ${escapeHtml(input.registrantName)},</p>
      <p>${business} has received ${who}.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px">
        ${row("For", input.what)}
        ${row("When", input.when)}
        ${row("Where", input.location)}
        ${input.amountDueCents > 0 ? row("Amount due", dollars(input.amountDueCents)) : ""}
      </table>
      <p>Reference: <strong>${escapeHtml(input.referenceCode)}</strong></p>
      ${input.amountDueCents > 0 ? `<p>You pay ${business} directly. They will confirm your place and send you how to pay; quote the reference above.</p>` : ""}
      <p><a href="${input.accountUrl}" style="color:#2463AE;font-weight:700">See it in your PortPass account →</a></p>
      <p style="color:#566174;font-size:12px;margin-top:32px">${business} · Sent via PortPass. Prices in Bahamian dollars (BSD), equal to US dollars.</p>
    </div>
  </div>`;
  return { subject: `${input.business.name}: registration received${input.childFirstName ? ` for ${input.childFirstName}` : ""}`, html };
}

export async function sendRegistrationReceivedEmail(input: RegistrationEmailInput): Promise<EmailOutcome> {
  const { subject, html } = registrationReceivedEmail(input);
  return sendEmail({ to: input.to, subject, html, from: viaPortpassFrom(input.business.name), log: { template: "registration_received", organizationId: input.organizationId } });
}
