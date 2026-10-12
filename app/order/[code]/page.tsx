import Link from "next/link";
import { ContactBusiness, PayFrame } from "@/app/pay/PayFrame";
import { getPublicOrder, type PublicOrder } from "@/db/marketOrders";
import { normalizeOrderCode, timeline } from "@/lib/market/orders";
import { formatNassau, money } from "@/lib/shop/rules";
import { ORDER_PAGE_METADATA, orderLookupAllowed } from "../lookup";
import "@/app/pay/pay.css";
import "../order.css";

export const dynamic = "force-dynamic";
export const metadata = ORDER_PAGE_METADATA;

type Params = Promise<{ code: string }>;

const FOOT = <>PortPass Market lists sellers in The Bahamas. You pay the seller directly; PortPass never holds anyone&rsquo;s money.</>;

function frameView(order: PublicOrder | null) {
  if (!order) return null;
  const s = order.seller;
  return { business: { id: 0, name: s.name, slug: s.slug, logoUrl: s.logoUrl, brandColor: s.brandColor, whatsappE164: s.whatsappE164, phoneE164: s.phoneE164, publicEmail: s.publicEmail, isDemo: false } };
}

function NotFound({ title, detail }: { title: string; detail: string }) {
  return (
    <PayFrame view={null} foot={FOOT}>
      <div>
        <p className="paypage-eyebrow">PortPass Market order</p>
        <h1>{title}</h1>
      </div>
      <p className="paypage-muted">{detail}</p>
      <p><Link className="paypage-btn is-small" href="/market">Go to PortPass Market</Link></p>
    </PayFrame>
  );
}

// The buyer's page for one Market order (brief 25, C3): no sign-in, the
// code is the key, rate-limited. Where the order is, what was ordered, how
// to get it, how to pay the seller directly and how to reach them. Never the buyer's name,
// phone or email, and no link to the payment page (that page carries the
// buyer's name; it is linked only from the buyer's own email), since an
// order code is shared in WhatsApp messages and on the seller's lists.
// Nothing here takes or processes a payment, and nothing moves (brief 22's
// Never list).
export default async function OrderPage({ params }: { params: Params }) {
  const { code: raw } = await params;
  if (!(await orderLookupAllowed())) return <NotFound title="Too many lookups" detail="Wait a minute, then open the link again." />;
  const code = normalizeOrderCode(raw);
  const order = code ? await getPublicOrder(code).catch((error) => {
    console.error("order page", error instanceof Error ? error.message : "");
    return null;
  }) : null;
  if (!order) return <NotFound title="We can't find that order" detail="Check the order code in your email, or ask the seller to look it up." />;

  const view = frameView(order)!;
  const s = order.seller;
  const cancelled = order.status === "cancelled";
  const handedOver = order.status === "collected" || order.status === "delivered";
  const steps = timeline(order);
  const status = cancelled
    ? { cls: "is-void", title: "Cancelled", text: `${s.name} cancelled this order. There's nothing to pay.` }
    : order.paid
      ? { cls: "is-paid", title: handedOver ? "Paid and handed over" : "Paid", text: handedOver ? "All done. Thank you." : `${s.name} has marked it paid. Thank you.` }
      : handedOver
        ? { cls: "", title: `${money(order.totalCents)} to pay`, text: `You have your order. Pay ${s.name} directly if you haven't yet.` }
        : { cls: "", title: `${money(order.totalCents)} to pay`, text: `Pay ${s.name} directly. They hold your order until ${formatNassau(order.holdUntil)}; if it isn't paid by then they may release it.` };

  return (
    <PayFrame view={view} foot={FOOT}>
      <div>
        <p className="paypage-eyebrow">Order from {s.name}</p>
        <h1><span className="paypage-ref">{order.referenceCode}</span></h1>
      </div>

      <section className={`paypage-status ${status.cls}`}>
        <strong>{status.title}</strong>
        <span>{status.text}</span>
      </section>

      <section className="paypage-card" aria-labelledby="ord-where">
        <h2 id="ord-where">Where your order is</h2>
        <ol className="ord-steps">
          {steps.map((step) => (
            <li key={step.status} className={`${step.done ? "is-done" : ""}${step.current ? " is-current" : ""}`} aria-current={step.current ? "step" : undefined}>
              <span className="ord-dot" aria-hidden="true" />
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
        <p className="paypage-muted">Ordered {formatNassau(order.createdAt)}. {s.name} moves it along; check back here any time.</p>
      </section>

      <section className="paypage-card" aria-labelledby="ord-what">
        <h2 id="ord-what">What you ordered</h2>
        <table className="paypage-items">
          <thead><tr><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.variantId}><td>{item.qty > 1 ? `${item.qty} × ` : ""}{item.title} ({item.label})</td><td>{money(item.qty * item.unitCents)}</td></tr>
            ))}
            {order.deliveryFeeCents > 0 && <tr><td>Delivery{order.zone ? ` to ${order.zone}` : ""}</td><td>{money(order.deliveryFeeCents)}</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Total</th><td><strong>{money(order.totalCents)}</strong></td></tr></tfoot>
        </table>
        <p className="ord-getting">
          {order.fulfilment === "pickup"
            ? <><strong>Pickup.</strong> {s.pickupNote || `${s.name} will tell you where and when.`}</>
            : <><strong>Delivery{order.zone ? ` to ${order.zone}` : ""}.</strong> {s.name} will arrange a time with you.</>}
        </p>
      </section>

      {!cancelled && !order.paid && (
        <section className="paypage-card" aria-labelledby="ord-pay">
          <h2 id="ord-pay">How to pay</h2>
          {order.paymentMethod === "cash" ? (
            <p>Cash to {s.name} when you collect.</p>
          ) : (
            <>
              <p>By bank transfer to {s.name}{order.payReference ? <>, quoting <strong>{order.payReference}</strong></> : null}. The bank details are on your payment page: open it from the email with your order code.</p>
            </>
          )}
        </section>
      )}

      <section className="paypage-card" aria-labelledby="ord-contact">
        <h2 id="ord-contact">Questions?</h2>
        <p className="paypage-muted">Contact {s.name} and give your order code.</p>
        <ContactBusiness business={view.business} />
        {s.slug && <p><Link href={`/shop/${s.slug}`}>More from {s.name} →</Link></p>}
      </section>
    </PayFrame>
  );
}
