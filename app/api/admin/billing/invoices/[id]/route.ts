import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { getAccount, getBankDetails, getInvoice, markInvoiceSent, recordReceipt, voidInvoice } from "@/db/billing";
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
  HAS_RECEIPTS: { status: 409, error: "Money has been recorded against this invoice, so it can't be voided." },
  REASON_REQUIRED: { status: 400, error: "Say why it is being voided. It is logged." },
  BAD_AMOUNT: { status: 400, error: "Enter the amount received." },
};

const dashboardUrl = (slug: string | null) => (slug ? `https://portpassbahamas.com/business/${encodeURIComponent(slug)}/billing` : null);

// Admin -> Billing -> one invoice (brief 09, 2.4): review and send by
// email (with the PDF), open WhatsApp with a message ready, record a
// receipt, or void. Every send is one founder's tap on one invoice:
// nothing here sends in bulk or by itself.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many actions in a short time. Try again in a few minutes." }, { status: 429 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; receipt?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const actor = auth.session.userId;

  try {
    if (action === "send_email") {
      const draft = await getInvoice(id);
      if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const account = await getAccount(draft.organizationId);
      if (!account?.billingEmail) return NextResponse.json({ error: "This business has no billing email. Add one to its account, or send it on WhatsApp." }, { status: 409 });
      const invoice = await markInvoiceSent(id, "email", actor);
      const bank = await getBankDetails();
      const email = invoiceSentEmail({ businessName: invoice.organizationName, number: invoice.number, totalCents: invoice.totalCents, owedCents: invoice.totalCents - invoice.paidCents, dueOn: invoice.dueOn, bank, dashboardUrl: dashboardUrl(invoice.organizationSlug) });
      const pdf = invoicePdf({ number: invoice.number, status: invoice.status, issuedOn: invoice.issuedOn, dueOn: invoice.dueOn, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, businessName: invoice.organizationName, billTo: [account.billingEmail, account.billingWhatsappE164 ?? ""], lines: invoice.lines, subtotalCents: invoice.subtotalCents, vatCents: invoice.vatCents, totalCents: invoice.totalCents, paidCents: invoice.paidCents, bank });
      const outcome = await sendEmail({ to: account.billingEmail, from: portpassFrom(), subject: email.subject, html: email.html, attachments: [{ filename: `${invoice.number}.pdf`, content: Buffer.from(pdf).toString("base64") }], log: { template: "billing_invoice_sent", organizationId: invoice.organizationId } });
      return NextResponse.json({ ok: true, status: invoice.status, emailed: outcome });
    }
    if (action === "whatsapp") {
      const draft = await getInvoice(id);
      if (!draft) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const account = await getAccount(draft.organizationId);
      const number = (account?.billingWhatsappE164 ?? "").replace(/\D/g, "");
      if (!number) return NextResponse.json({ error: "This business has no billing WhatsApp number. Add one to its account." }, { status: 409 });
      const invoice = await markInvoiceSent(id, "whatsapp", actor);
      const message = invoiceWhatsappMessage({ businessName: invoice.organizationName, number: invoice.number, totalCents: invoice.totalCents, dueOn: invoice.dueOn, dashboardUrl: dashboardUrl(invoice.organizationSlug) });
      // The founder taps this and presses send in WhatsApp themselves.
      return NextResponse.json({ ok: true, status: invoice.status, whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}` });
    }
    if (action === "receipt") {
      const cleaned = cleanReceipt(body?.receipt);
      if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      const invoice = await recordReceipt(id, cleaned.value, actor);
      return NextResponse.json({ ok: true, status: invoice.status, paidCents: invoice.paidCents });
    }
    if (action === "void") {
      const invoice = await voidInvoice(id, typeof body?.reason === "string" ? body.reason : "", actor);
      return NextResponse.json({ ok: true, status: invoice.status });
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
