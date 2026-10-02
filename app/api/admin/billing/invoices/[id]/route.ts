import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { getAccount, getBankDetails, invoiceAsSent, markInvoiceSent, recordReceipt, redraftPeriod, reverseReceipt, voidInvoice } from "@/db/billing";
import { owedCents } from "@/lib/billing";
import { invoiceSentEmail, invoiceWhatsappMessage } from "@/lib/billingEmail";
import { cleanReceipt } from "@/lib/billingInput";
import { portpassFrom, sendEmail } from "@/lib/email";
import { invoicePdf } from "@/lib/invoicePdf";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(60, 10 * 60_000);

const REFUSALS: Record<string, { status: number; error: string }> = {
  NOT_FOUND: { status: 404, error: "Not found." },
  BANK_DETAILS_MISSING: { status: 409, error: "Add PortPass's bank details in Settings first. An invoice can't be sent without a way to pay it." },
  VOID: { status: 409, error: "This invoice is void." },
  NOT_DRAFT: { status: 409, error: "This invoice was already sent. Refresh the page." },
  NOT_PAYABLE: { status: 409, error: "Send the invoice before recording money against it." },
  OVERPAID: { status: 409, error: "That is more than is still owed on this invoice. Check the amount, and that it is the right invoice." },
  HAS_RECEIPTS: { status: 409, error: "Money has been recorded against this invoice, so it can't be voided. Reverse the receipt first if it was recorded by mistake." },
  REASON_REQUIRED: { status: 400, error: "Say why. It is logged." },
  BAD_AMOUNT: { status: 400, error: "Enter the amount received." },
  ALREADY_REVERSED: { status: 409, error: "That receipt was already reversed. Refresh the page." },
  NOT_REDRAFTABLE: { status: 409, error: "Only a void plan invoice can be drafted again, for a business on a monthly or annual plan." },
  PERIOD_COVERED: { status: 409, error: "Another invoice already covers that period." },
  CYCLE_CHANGED: { status: 409, error: "This invoice was for a different billing cycle than the account has now, so its period can't be drafted again as it was. The daily run drafts the next period at the account's terms as they are now." },
};

const dashboardUrl = (slug: string | null) => (slug ? `https://portpassbahamas.com/business/${encodeURIComponent(slug)}/billing` : null);

// Admin -> Billing -> one invoice (brief 09, 2.4): review and send by
// email (with the PDF), open WhatsApp with a message ready, record a
// receipt or reverse one, void, or draft a voided period again. Every send
// is one founder's tap on one invoice: nothing here sends in bulk or by
// itself. An emailed invoice is marked sent only once the email has gone.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many actions in a short time. Try again in a few minutes." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; receipt?: unknown; receiptId?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const actor = auth.session.userId;

  try {
    if (action === "send_email") {
      // Written as it will read once sent, emailed, and only then marked:
      // a failed email leaves a draft a draft, with no due date running.
      const invoice = await invoiceAsSent(id);
      const account = await getAccount(invoice.organizationId);
      if (!account?.billingEmail) return NextResponse.json({ error: "This business has no billing email. Add one to its account, or send it on WhatsApp." }, { status: 409 });
      const bank = await getBankDetails();
      const email = invoiceSentEmail({ businessName: invoice.organizationName, number: invoice.number, totalCents: invoice.totalCents, owedCents: owedCents(invoice), dueOn: invoice.dueOn, bank, dashboardUrl: dashboardUrl(invoice.organizationSlug) });
      const pdf = invoicePdf({ number: invoice.number, status: invoice.status, issuedOn: invoice.issuedOn, dueOn: invoice.dueOn, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, businessName: invoice.organizationName, billTo: [account.billingEmail, account.billingWhatsappE164 ?? ""], lines: invoice.lines, subtotalCents: invoice.subtotalCents, vatCents: invoice.vatCents, totalCents: invoice.totalCents, paidCents: invoice.paidCents, bank });
      const outcome = await sendEmail({ to: account.billingEmail, from: portpassFrom(), subject: email.subject, html: email.html, attachments: [{ filename: `${invoice.number}.pdf`, content: Buffer.from(pdf).toString("base64") }], log: { template: "billing_invoice_sent", organizationId: invoice.organizationId } });
      if (outcome !== "sent") {
        return NextResponse.json({ error: outcome === "skipped" ? "The email was not sent: email isn't set up here, or this is a test address. Nothing about the invoice has changed." : "The email failed to send (see Messages). Nothing about the invoice has changed." }, { status: 502 });
      }
      const sent = await markInvoiceSent(id, "email", actor);
      return NextResponse.json({ ok: true, status: sent.status });
    }
    if (action === "whatsapp") {
      const invoice = await invoiceAsSent(id);
      const account = await getAccount(invoice.organizationId);
      const number = (account?.billingWhatsappE164 ?? "").replace(/\D/g, "");
      if (!number) return NextResponse.json({ error: "This business has no billing WhatsApp number. Add one to its account." }, { status: 409 });
      const sent = await markInvoiceSent(id, "whatsapp", actor);
      const message = invoiceWhatsappMessage({ businessName: sent.organizationName, number: sent.number, totalCents: sent.totalCents, owedCents: owedCents(sent), dueOn: sent.dueOn, dashboardUrl: dashboardUrl(sent.organizationSlug) });
      // The founder taps this and presses send in WhatsApp themselves.
      return NextResponse.json({ ok: true, status: sent.status, whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}` });
    }
    if (action === "mark_sent") {
      // Handed over another way (printed, or sent from a founder's own email).
      const sent = await markInvoiceSent(id, "in_person", actor);
      return NextResponse.json({ ok: true, status: sent.status });
    }
    if (action === "receipt") {
      const cleaned = cleanReceipt(body?.receipt);
      if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      const invoice = await recordReceipt(id, cleaned.value, actor);
      return NextResponse.json({ ok: true, status: invoice.status, paidCents: invoice.paidCents });
    }
    if (action === "reverse_receipt") {
      const receiptId = Number(body?.receiptId);
      if (!Number.isInteger(receiptId) || receiptId <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const invoice = await reverseReceipt(id, receiptId, typeof body?.reason === "string" ? body.reason : "", actor);
      return NextResponse.json({ ok: true, status: invoice.status, paidCents: invoice.paidCents });
    }
    if (action === "void") {
      const invoice = await voidInvoice(id, typeof body?.reason === "string" ? body.reason : "", actor);
      return NextResponse.json({ ok: true, status: invoice.status });
    }
    if (action === "redraft") {
      const invoice = await redraftPeriod(id, actor);
      return NextResponse.json({ ok: true, id: invoice.id, number: invoice.number });
    }
    return NextResponse.json({ error: "Choose an action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const refusal = REFUSALS[message];
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin billing invoice action", action, message);
    return NextResponse.json({ error: "That didn't finish. Refresh the page to see where the invoice stands." }, { status: 500 });
  }
}
