import { formatPrice } from "@/app/_components/blocks/format";
import { lookupAllowed, PAY_PAGE_METADATA } from "@/app/pay/lookup";
import { ContactBusiness, PayFrame } from "@/app/pay/PayFrame";
import "@/app/pay/pay.css";
import { getPublicBooking } from "@/db/bookingRequests";
import { customerCanCancel, CUSTOMER_STATUS_LABEL, formatWhen } from "@/lib/bookings/rules";
import { money } from "@/lib/paymentRequests/rules";
import { CancelBooking } from "./CancelBooking";

export const dynamic = "force-dynamic";
// The link is the key to this page: never indexed, never sent on in a Referer.
export const metadata = { title: "Booking request | PortPass Bahamas", ...PAY_PAGE_METADATA };

type Params = Promise<{ token: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FOOT = <>PortPass passes booking requests to businesses in The Bahamas. You pay the business directly.</>;

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <PayFrame view={null} foot={FOOT}>
      <div>
        <p className="paypage-eyebrow">Booking request</p>
        <h1>{title}</h1>
      </div>
      <p className="paypage-muted">{detail}</p>
    </PayFrame>
  );
}

// The customer's page for one booking request (brief 19, A5): where it
// stands, what was asked for, the payment request once the business has
// sent one, and Cancel while nobody has answered. Opened by its link
// alone, so it leaves off the customer's own phone and email: a link can
// be forwarded.
export default async function BookingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { token } = await params;
  if (!(await lookupAllowed())) return <Unavailable title="Too many lookups" detail="Wait a minute, then open the link again." />;
  const view = await getPublicBooking(token);
  if (!view) return <Unavailable title="This link isn't valid" detail="Check you have the whole link from your confirmation email." />;
  const { booking: b, business, payment } = view;
  const justSent = (await searchParams).sent === "1" && b.status === "new";
  const pageHref = business.slug && business.primaryCategory ? `/${business.primaryCategory}/${business.slug}` : null;

  const statusBox =
    b.status === "new"
      ? { cls: "", title: justSent ? "Request sent" : CUSTOMER_STATUS_LABEL.new, text: `${business.name} will confirm within a day. Nothing is booked, and nothing is owed, until they do.` }
      : b.status === "confirmed"
        ? { cls: "is-paid", title: "Confirmed", text: `${business.name} has confirmed your booking for ${formatWhen(b.requestedDate, b.requestedTime)}.` }
        : b.status === "done"
          ? { cls: "is-paid", title: "Completed", text: `Thank you for booking with ${business.name}.` }
          : b.status === "declined"
            ? { cls: "is-void", title: "Not available", text: `${business.name} can't take this request. Nothing is owed.` }
            : { cls: "is-void", title: "Cancelled", text: "You cancelled this request. Nothing is booked and nothing is owed." };

  return (
    <PayFrame view={view} foot={FOOT}>
      <div>
        <p className="paypage-eyebrow">Booking request{b.customerFirstName ? ` for ${b.customerFirstName}` : ""}</p>
        <h1><span className="paypage-ref">{b.referenceCode}</span></h1>
      </div>

      <section className={`paypage-status ${statusBox.cls}`} aria-live="polite">
        <strong>{statusBox.title}</strong>
        <span>{statusBox.text}</span>
        {justSent && <span>We&rsquo;ve emailed you this reference and a link back to this page.</span>}
      </section>

      {b.status === "declined" && b.declinedReason && (
        <section className="paypage-card" aria-labelledby="booking-reason">
          <h2 id="booking-reason">What {business.name} said</h2>
          <p className="paypage-muted">{b.declinedReason}</p>
          {pageHref && <a className="paypage-btn is-small" href={pageHref}>Ask for another date</a>}
        </section>
      )}

      <section className="paypage-card" aria-labelledby="booking-what">
        <h2 id="booking-what">What you asked for</h2>
        <dl className="paypage-receipt-meta">
          <div><dt>For</dt><dd>{b.offeringName}</dd></div>
          <div><dt>When</dt><dd>{formatWhen(b.requestedDate, b.requestedTime)}</dd></div>
          {b.durationOrQty && <div><dt>How many</dt><dd>{b.durationOrQty}</dd></div>}
          {b.locationText && <div><dt>Where</dt><dd>{b.locationText}</dd></div>}
          {b.childFirstName && <div><dt>Child</dt><dd>{b.childFirstName}</dd></div>}
          {b.priceCents !== null && <div><dt>Price</dt><dd>{formatPrice(b.priceCents, b.priceUnit)}</dd></div>}
        </dl>
        {b.notes && <p className="paypage-muted" style={{ whiteSpace: "pre-line" }}>Your note: {b.notes}</p>}
        <p className="paypage-muted">Prices in Bahamian dollars (BSD). {business.name} confirms the final amount.</p>
      </section>

      {payment && (
        <section className="paypage-card" aria-labelledby="booking-payment">
          <h2 id="booking-payment">Payment</h2>
          {payment.status === "paid" ? (
            <p className="paypage-muted">{business.name} has recorded {money(payment.totalCents)} as paid on {payment.referenceCode}. Thank you.</p>
          ) : (
            <p className="paypage-muted">{business.name} has sent payment request {payment.referenceCode}: {money(payment.balanceCents)} to pay. You pay {business.name} directly; PortPass never holds your money.</p>
          )}
          <a className="paypage-btn is-solid" href={payment.payPath}>{payment.status === "paid" ? "See the receipt" : "See how to pay"}</a>
        </section>
      )}

      {customerCanCancel(b.status) && (
        <section className="paypage-card paypage-noprint" aria-labelledby="booking-change">
          <h2 id="booking-change">Changed your mind?</h2>
          <p className="paypage-muted">You can cancel while {business.name} hasn&rsquo;t answered yet.</p>
          <CancelBooking token={b.token} businessName={business.name} />
        </section>
      )}

      <section className="paypage-card paypage-noprint" aria-labelledby="booking-questions">
        <h2 id="booking-questions">Questions?</h2>
        <p className="paypage-muted">Contact {business.name} about {b.referenceCode}.</p>
        <ContactBusiness business={business} />
        {pageHref && <p className="paypage-muted"><a href={pageHref}>{business.name} on PortPass</a></p>}
      </section>
    </PayFrame>
  );
}
