import { NextResponse } from "next/server";
import { getAccount, getBankDetails, getInvoice } from "@/db/billing";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { invoiceStatus, shownToBusiness } from "@/lib/billing";
import { nassauToday } from "@/lib/futprepTerms";
import { invoicePdf } from "@/lib/invoicePdf";

type Ctx = { params: Promise<{ id: string; invoiceId: string }> };

// One PortPass invoice as a PDF, for the business it was sent to (its
// owners and admins; never its staff) and for platform staff. The invoice
// must belong to the business in the address: another business's owner
// gets "not found". A draft is PortPass's own working copy until it is
// sent, so only platform staff can open one (or one that was voided
// before it was ever sent).
export async function GET(_request: Request, ctx: Ctx) {
  const { id, invoiceId } = await ctx.params;
  const orgId = Number(id);
  const wanted = Number(invoiceId);
  if (!Number.isInteger(orgId) || orgId <= 0 || !Number.isInteger(wanted) || wanted <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(orgId, "org_admin");
  if (!auth.ok) return auth.response;
  const invoice = await getInvoice(wanted);
  if (!invoice || invoice.organizationId !== orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!shownToBusiness(invoice) && !auth.session.platformRole) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [account, bank] = await Promise.all([getAccount(orgId), getBankDetails()]);
  const pdf = invoicePdf({
    number: invoice.number, status: invoiceStatus(invoice, nassauToday()), issuedOn: invoice.issuedOn, dueOn: invoice.dueOn, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd,
    businessName: invoice.organizationName, billTo: [account?.billingEmail ?? "", account?.billingWhatsappE164 ?? ""], lines: invoice.lines,
    subtotalCents: invoice.subtotalCents, vatCents: invoice.vatCents, totalCents: invoice.totalCents, paidCents: invoice.paidCents, bank,
  });
  return new NextResponse(Buffer.from(pdf), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoice.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
