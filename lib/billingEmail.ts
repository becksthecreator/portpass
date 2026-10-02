import { longDay, money, type BankDetails, type Reminder } from "./billing";
import { howToPay } from "./billing";
import { escapeHtml, portpassEmailShell } from "./email";

// The emails PortPass sends a business about its own plan and invoices
// (brief 09, 2.3 and 2.4). Plain words, the amount, the date, and how to
// pay. Each is sent to the account's billing email only.

const p = (html: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${html}</p>`;

export type BillingEmail = { subject: string; html: string };

// "Your free month ends on [date]. From [date+1] your plan is Growing,
// $120/month. Reply if you have questions."
export function trialEndingEmail(input: { businessName: string; planName: string; priceCents: number; annual: boolean; freeUntil: string; firstInvoiceOn: string }): BillingEmail {
  const price = input.annual ? `${money(input.priceCents)} a year` : `${money(input.priceCents)} a month`;
  return {
    subject: `${input.businessName}: your free period ends on ${longDay(input.freeUntil)}`,
    html: portpassEmailShell("Your free period is ending", `${p(`Your free period for ${escapeHtml(input.businessName)} on PortPass ends on <strong>${longDay(input.freeUntil)}</strong>.`)}${p(`From ${longDay(input.firstInvoiceOn)} your plan is ${escapeHtml(input.planName)}, ${price}. We will send you an invoice then: nothing is ever taken automatically, and we never deduct anything from your customers' payments.`)}${p("Reply to this email if you have any questions.")}`),
  };
}

type InvoiceEmailInput = { businessName: string; number: string; totalCents: number; owedCents: number; dueOn: string; bank: BankDetails; dashboardUrl: string | null };

const payBlock = (input: InvoiceEmailInput) =>
  `${p(`${escapeHtml(howToPay(input.bank))}<br>Please use <strong>${escapeHtml(input.number)}</strong> as your payment reference.`)}${input.dashboardUrl ? p(`Your invoices are also in your PortPass dashboard: <a href="${input.dashboardUrl}" style="color:#2463AE">open my plan</a>.`) : ""}${p("PortPass never deducts its fees from your customers' payments. This invoice is how we are paid.")}`;

export function invoiceSentEmail(input: InvoiceEmailInput): BillingEmail {
  // Paid already (a copy was asked for): no "please pay" in it.
  if (input.owedCents <= 0) {
    return {
      subject: `PortPass invoice ${input.number} for ${input.businessName}: paid in full`,
      html: portpassEmailShell(`Invoice ${input.number}`, `${p(`A copy of your PortPass invoice for ${escapeHtml(input.businessName)} is attached: <strong>${money(input.totalCents)}</strong>, paid in full. Thank you.`)}`),
    };
  }
  const balance = input.owedCents < input.totalCents ? ` <strong>${money(input.owedCents)}</strong> of it is still to pay.` : "";
  return {
    subject: `PortPass invoice ${input.number} for ${input.businessName}: ${money(input.totalCents)}, due ${longDay(input.dueOn)}`,
    html: portpassEmailShell(`Invoice ${input.number}`, `${p(`Your PortPass invoice for ${escapeHtml(input.businessName)} is attached: <strong>${money(input.totalCents)}</strong>, due on <strong>${longDay(input.dueOn)}</strong>.${balance}`)}${payBlock(input)}`),
  };
}

export function invoiceReminderEmail(kind: Extract<Reminder["kind"], "invoice_due_3" | "invoice_overdue_1" | "invoice_overdue_7">, input: InvoiceEmailInput): BillingEmail {
  const owed = money(input.owedCents);
  if (kind === "invoice_due_3") {
    return { subject: `PortPass invoice ${input.number} is due on ${longDay(input.dueOn)}`, html: portpassEmailShell("A reminder", `${p(`Invoice ${escapeHtml(input.number)} for ${escapeHtml(input.businessName)} is due in three days, on <strong>${longDay(input.dueOn)}</strong>: ${owed}.`)}${payBlock(input)}${p("If you have already paid, thank you: you can ignore this.")}`) };
  }
  const late = kind === "invoice_overdue_1" ? "was due yesterday" : "is now a week overdue";
  return { subject: `PortPass invoice ${input.number} is overdue`, html: portpassEmailShell("Your invoice is overdue", `${p(`Invoice ${escapeHtml(input.number)} for ${escapeHtml(input.businessName)} ${late}: <strong>${owed}</strong> is outstanding.`)}${payBlock(input)}${p("If something is wrong with the invoice, or you need more time, reply to this email and we will sort it out together.")}`) };
}

// The message a founder sends on WhatsApp with an invoice. Nothing is sent
// from here: this is the text that opens in WhatsApp for them to send.
// It says only what is true whichever way the invoice went out: the
// amount, the date, and where to see it. Never that an email was sent.
export function invoiceWhatsappMessage(input: { businessName: string; number: string; totalCents: number; owedCents: number; dueOn: string; dashboardUrl: string | null }): string {
  const amount = input.owedCents > 0 && input.owedCents < input.totalCents ? `${money(input.totalCents)}, with ${money(input.owedCents)} still to pay` : money(input.totalCents);
  const where = input.dashboardUrl ? ` You can see it, with how to pay, in your PortPass dashboard: ${input.dashboardUrl}` : "";
  return `Hi! Your PortPass invoice ${input.number} for ${input.businessName} is ready: ${amount}, due ${longDay(input.dueOn)}.${where} Please use ${input.number} as your payment reference. Thank you!`;
}
