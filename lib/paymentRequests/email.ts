import { escapeHtml, portpassFrom } from "@/lib/email";
import { firstName, formatDay, money, type LineItem } from "./rules";

// Payment request emails (brief 17). Sent only when a staff member presses
// "Send by email" (or "Remind by email", or "Email the receipt"): never on
// a schedule, never in bulk. From "<Business> via PortPass" at PortPass's
// own verified address. No health or personal details: the lines say what
// it's for (for Futprep, the programme and the child's first name).

export type PaymentEmailKind = "request" | "reminder" | "receipt";

export type PaymentEmailInput = {
  kind: PaymentEmailKind;
  businessName: string;
  customerName: string;
  referenceCode: string;
  lines: LineItem[];
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string;
  payUrl: string;
  receipt?: { number: string; amountCents: number; url: string };
};

// "Futprep Athletics via PortPass <hello@portpassbahamas.com>": the
// business's name as the sender's name, PortPass's verified address.
export function viaPortpassFrom(businessName: string, base: string | undefined = portpassFrom()): string | undefined {
  if (!base) return undefined;
  const address = /<([^>]+)>/.exec(base)?.[1] ?? base.trim();
  const name = businessName.replace(/["<>\r\n\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "A business";
  return `"${name} via PortPass" <${address}>`;
}

export function paymentEmail(input: PaymentEmailInput, today?: string): { subject: string; html: string } {
  const business = escapeHtml(input.businessName);
  const due = formatDay(input.dueDate, today);
  const rows = input.lines
    .map((l) => `<tr><td style="padding:6px 0">${escapeHtml(l.qty > 1 ? `${l.qty} × ${l.label}` : l.label)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${money(l.qty * l.unitCents)}</td></tr>`)
    .join("");
  const summary = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px">
      ${rows}
      <tr><td style="padding:8px 0;border-top:1px solid #d9dee8"><strong>Total</strong></td><td style="padding:8px 0;border-top:1px solid #d9dee8;text-align:right"><strong>${money(input.totalCents)}</strong></td></tr>
      ${input.paidCents > 0 ? `<tr><td style="padding:4px 0">Paid so far</td><td style="padding:4px 0;text-align:right">${money(input.paidCents)}</td></tr>` : ""}
      ${input.balanceCents > 0 ? `<tr><td style="padding:4px 0">Balance</td><td style="padding:4px 0;text-align:right"><strong>${money(input.balanceCents)}</strong></td></tr>` : ""}
    </table>`;
  const direct = `<p style="font-size:13px;color:#4b5563">Pay ${business} directly. PortPass never holds your money.</p>`;
  const button = (href: string, label: string) =>
    `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#0D1B3D;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${label}</a></p>`;
  const hello = `<p>Hi ${escapeHtml(firstName(input.customerName))},</p>`;
  const reference = escapeHtml(input.referenceCode);

  let subject: string;
  let body: string;
  if (input.kind === "receipt" && input.receipt) {
    subject = `Receipt ${input.receipt.number} from ${input.businessName}`;
    body = `${hello}
      <p>${business} received <strong>${money(input.receipt.amountCents)}</strong> for ${reference}. Thank you.</p>
      ${summary}
      ${button(input.receipt.url, "View your receipt")}`;
  } else if (input.kind === "reminder") {
    subject = `Reminder: ${input.referenceCode} from ${input.businessName}`;
    body = `${hello}
      <p>A reminder from ${business}: <strong>${money(input.balanceCents)}</strong> on ${reference} was due ${escapeHtml(due)}.</p>
      ${summary}
      ${button(input.payUrl, "See how to pay")}
      <p>If you've already paid, thank you. Tap "I've paid" on that page so ${business} can check.</p>
      ${direct}`;
  } else {
    subject = `Payment request ${input.referenceCode} from ${input.businessName}`;
    body = `${hello}
      <p>${business} has sent you a payment request, due <strong>${escapeHtml(due)}</strong>.</p>
      ${summary}
      ${button(input.payUrl, "See how to pay")}
      ${direct}`;
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0D1B3D">
    <p style="font-size:13px;font-weight:700;margin:0 0 6px;color:#4b5563">${business}</p>
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(subject.replace(` from ${input.businessName}`, ""))}</h1>
    ${body}
    <p style="color:#647069;font-size:12px;margin-top:32px">Sent by ${business} through PortPass · portpassbahamas.com</p>
  </div>`;
  return { subject, html };
}
