import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getPlanCard } from "@/db/billing";
import { getBusinessBySlug } from "@/db/business";
import { requireOrgRole } from "@/lib/auth/guards";
import { ACCOUNT_STATUS_LABEL, annualPriceCents, bankDetailsComplete, CYCLE_LABEL, howToPay, INVOICE_STATUS_LABEL, isSubscription, longDay, money, owedCents } from "@/lib/billing";
import { PORTPASS_WHATSAPP_URL } from "@/lib/contact";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  return { title: `${slug} | Your plan | PortPass Bahamas`, robots: { index: false, follow: false } };
}

// "Your plan" (brief 09, 1.3): what this business pays PortPass, when the
// free period ends, the next invoice, every invoice so far and how to pay.
// For the business's owners and admins only, never its staff.
export default async function BusinessBillingPage({ params }: { params: Params }) {
  const { slug } = await params;
  await requireOrgRole({ slug }, "org_admin", `/business/${slug}/billing`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const card = await getPlanCard(business.id);
  const account = card.account;
  const owed = card.invoices.reduce((sum, invoice) => sum + owedCents(invoice), 0);

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Your plan", href: `/business/${slug}/billing` }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />Your plan</div>
        <h1>{business.name}</h1>
        {!account || account.cycle === "not_agreed" ? (
          <p className="auth-lead">Your plan with PortPass hasn&rsquo;t been set yet.{owed === 0 ? " Nothing is owed." : ""} <a href={PORTPASS_WHATSAPP_URL}>Message us</a> if you&rsquo;d like to talk it through.</p>
        ) : (
          <p className="auth-lead">
            {card.planName ? `${card.planName} plan` : CYCLE_LABEL[account.cycle]}
            {isSubscription(account.cycle) ? `: ${account.cycle === "annual" ? `${money(annualPriceCents(account))} a year` : `${money(account.priceCents)} a month`}` : account.commissionBps ? `: ${account.commissionBps / 100}% of the bookings PortPass brings you, invoiced once a month` : ""}.
          </p>
        )}
        {/* Where things stand shows whenever there is an account, or
            anything owed: a business with an unpaid invoice is never told
            "nothing is owed". */}
        {(account || owed > 0) && (
          <ul className="account-places">
            {account && card.status && <li><strong>Where you stand</strong><span>{ACCOUNT_STATUS_LABEL[card.status]}</span></li>}
            {card.freeUntil && <li><strong>Free until</strong><span>{longDay(card.freeUntil)}</span></li>}
            {card.nextInvoiceOn && <li><strong>Next invoice</strong><span>{longDay(card.nextInvoiceOn)}{card.nextInvoiceCents ? `, ${money(card.nextInvoiceCents)}` : ""}</span></li>}
            {owed > 0 && <li><strong>Owed now</strong><span>{money(owed)}</span></li>}
          </ul>
        )}

        <section className="account-section">
          <h2>Invoices</h2>
          {card.invoices.length === 0 ? (
            <p className="auth-lead">None yet.</p>
          ) : (
            <ul className="account-places">
              {card.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <strong>{invoice.number} · {money(invoice.totalCents)}</strong>
                  <span>{INVOICE_STATUS_LABEL[invoice.status]}{invoice.status === "paid" || invoice.status === "void" ? "" : ` · due ${longDay(invoice.dueOn)}`} · <a href={`/api/business/orgs/${business.id}/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">PDF</a></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="account-section">
          <h2>How to pay</h2>
          <p className="auth-lead">{bankDetailsComplete(card.bank) ? howToPay(card.bank) : "By bank transfer. The details are on each invoice."} Use the invoice number as your payment reference.</p>
          <p className="auth-hint">We send you one invoice. We never take our fee out of your customers&rsquo; payments, and nothing is ever charged automatically.</p>
        </section>

        <p className="auth-hint"><Link href={`/business/${slug}`}>Back to my business</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
