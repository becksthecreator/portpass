import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computeBrandTokens } from "@/app/_components/blocks/brand";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { getReceipt } from "@/db/shop";
import { formatNassau, formatReadyOn, fulfilmentLabel, money, paymentMethodLabel, whatsappHref } from "@/lib/shop/rules";
import "../../../shop.css";

// The buyer's reservation page (brief 15): the reference code, how to pay
// the seller directly, and the itemised receipt the Consumer Protection
// Act asks for. Reached only through the unguessable link in the receipt
// URL; never indexed. No card payment, no PortPass checkout.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your reservation | PortPass Bahamas",
  robots: { index: false, follow: false },
};

type Params = Promise<{ org: string; token: string }>;

export default async function ReservationPage({ params }: { params: Params }) {
  const { org: orgSlug, token } = await params;
  const receipt = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(orgSlug) ? await getReceipt(orgSlug, token).catch(() => null) : null;
  if (!receipt) notFound();
  const { org, shop, drop, reservation: r } = receipt;
  const { brand, brandText } = computeBrandTokens(org.brandColor);
  const bank = org.bankTransferDetails;
  const active = r.status === "active";
  const statusLabel = !active
    ? r.status === "cancelled" ? "Cancelled" : "Released: not paid in time"
    : r.paymentStatus === "paid" ? (r.collectedAt ? "Paid · collected" : "Paid") : r.paymentStatus === "refunded" ? "Refunded" : "Payment pending";
  const sellerMessage = org.whatsappE164 ? whatsappHref(org.whatsappE164, `Hi ${org.name}, this is ${r.buyerName} about my reservation ${r.referenceCode}.`) : null;

  return (
    <main className={`tpl-page shop-page ${ppDisplay.variable} ${ppSans.variable}`} style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      <SiteHeader breadcrumb={[{ label: org.name, href: `/shop/${orgSlug}` }, { label: "Your reservation", href: `/shop/${orgSlug}/reservation/${token}` }]} />

      <section className="shop-receipt">
        <p className="shop-eyebrow">{org.name} · {drop.title}</p>
        <h1>{active && r.paymentStatus === "pending" ? "Reserved. Now pay " + org.name + " directly." : "Your reservation"}</h1>

        <div className="shop-reference">
          <span>Reference</span>
          <strong>{r.referenceCode}</strong>
          <em className={`shop-status shop-status-${active ? r.paymentStatus : r.status}`}>{statusLabel}</em>
        </div>

        {active && r.paymentStatus === "pending" && (
          <div className="shop-pay-box">
            <h2>Pay {org.name} directly</h2>
            <p>Your reservation is held for {shop.holdHours} hours until paid: until <strong>{formatNassau(r.holdUntil)}</strong>. After that {org.name} may release it.</p>
            {r.paymentMethod === "bank_transfer" && bank ? (
              <>
                <p>Send <strong>{money(r.totalCents)}</strong> by bank transfer and use <strong>{r.referenceCode}</strong> as the reference.</p>
                <dl className="bank-details">
                  <div><dt>Bank</dt><dd>{bank.bank}</dd></div>
                  <div><dt>Account name</dt><dd>{bank.accountName}</dd></div>
                  <div><dt>Account number</dt><dd>{bank.accountNumber}</dd></div>
                  {bank.branch && <div><dt>Branch</dt><dd>{bank.branch}</dd></div>}
                  {bank.instructions && <div><dt>Notes</dt><dd>{bank.instructions}</dd></div>}
                </dl>
              </>
            ) : (
              <p>{paymentMethodLabel(r.paymentMethod, r.fulfilment)}: bring <strong>{money(r.totalCents)}</strong> and say your reference, <strong>{r.referenceCode}</strong>.</p>
            )}
            <p className="shop-muted">PortPass never takes the money: {org.name} marks your reservation paid when it arrives.</p>
            {sellerMessage && <a className="secondary-button" href={sellerMessage} target="_blank" rel="noopener noreferrer">Message {org.name} on WhatsApp</a>}
          </div>
        )}

        <section className="shop-receipt-card" aria-labelledby="receipt-items">
          <h2 id="receipt-items">Itemised receipt</h2>
          <p className="shop-muted">{org.name} · reserved {formatNassau(r.createdAt)} · for {r.buyerName}</p>
          <table className="shop-lines">
            <thead>
              <tr><th scope="col">Item</th><th scope="col" className="shop-num">Qty</th><th scope="col" className="shop-num">Each</th><th scope="col" className="shop-num">Total</th></tr>
            </thead>
            <tbody>
              {r.items.map((item) => (
                <tr key={item.variantId}>
                  <td>{item.title}<small>{item.label}</small></td>
                  <td className="shop-num">{item.qty}</td>
                  <td className="shop-num">{money(item.unitCents)}</td>
                  <td className="shop-num">{money(item.qty * item.unitCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={3}>Total (BSD = USD)</th><td className="shop-num"><strong>{money(r.totalCents)}</strong></td></tr>
            </tfoot>
          </table>
          <dl className="shop-receipt-facts">
            <div><dt>Payment</dt><dd>{paymentMethodLabel(r.paymentMethod, r.fulfilment)} · {statusLabel}</dd></div>
            <div><dt>{fulfilmentLabel(r.fulfilment)}</dt><dd>{r.fulfilment === "pickup" ? drop.pickupNote || "Details from the seller" : [r.zone, drop.deliveryNote].filter(Boolean).join(" · ")}</dd></div>
            {drop.readyOn && <div><dt>Ready</dt><dd>From {formatReadyOn(drop.readyOn)}</dd></div>}
          </dl>
        </section>

        <section className="shop-receipt-card" aria-labelledby="receipt-returns">
          <h2 id="receipt-returns">Returns policy</h2>
          <p className="shop-policy">{shop.returnsPolicy}</p>
        </section>

        <p className="shop-receipt-keep">Keep this page: its link is your receipt. <Link href={`/shop/${orgSlug}`}>Back to {org.name} →</Link></p>
      </section>

      <SiteFooter orgLine={`${org.name} · Reservations through PortPass. You pay ${org.name} directly.`} />
    </main>
  );
}
