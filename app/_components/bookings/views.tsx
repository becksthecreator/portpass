import Link from "next/link";
import { formatPrice } from "@/app/_components/blocks/format";
import type { BookingPayment, BookingRequest } from "@/db/bookingRequests";
import { BOOKING_STATUS_LABEL, BOOKING_TAB_LABEL, BOOKING_TABS, bookingWhatsAppText, formatWhen, sortForTab, tabOf, whatsAppLink, type BookingTab } from "@/lib/bookings/rules";
import { money } from "@/lib/paymentRequests/rules";
import { formatPhoneDisplay } from "@/lib/phone";
import { BookingActions } from "./BookingActions";
import "./bookings.css";

// A business's Bookings screen (brief 19, A4): the requests customers have
// made for its priced offerings, in four lists. The page's guard decides
// who is looking; this only draws what it is handed.

const asked = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Nassau" }) : "");

const PAYMENT_STATUS: Record<string, string> = { draft: "not sent yet", sent: "sent", part_paid: "part paid", paid: "paid", void: "cancelled" };

function PaymentLine({ payment, paymentsPath }: { payment: BookingPayment; paymentsPath: string | null }) {
  const balance = Math.max(0, payment.totalCents - payment.paidCents);
  const text = `${payment.referenceCode} · ${PAYMENT_STATUS[payment.status] ?? payment.status}${payment.status === "paid" || payment.status === "void" ? "" : ` · ${money(balance)} to pay`}`;
  return <p className="bkg-payment">Payment request: {paymentsPath ? <Link href={`${paymentsPath}/${payment.id}`}>{text}</Link> : text}</p>;
}

export function BookingsList({
  business,
  bookings,
  payments,
  tab,
  basePath,
  homeHref,
  apiBase,
  paymentsPath,
  publicHref,
}: {
  business: { name: string; isPublished: boolean };
  bookings: BookingRequest[];
  payments: Map<number, BookingPayment>;
  tab: BookingTab;
  // This screen: `${basePath}?tab=confirmed`.
  basePath: string;
  homeHref: string;
  // Where a button's change is sent: `${apiBase}/${id}`.
  apiBase: string;
  // The business's Payments screens, or null when this person doesn't
  // handle payments: then no "Request payment" and no link to a request.
  paymentsPath: string | null;
  publicHref: string | null;
}) {
  const counts = new Map<BookingTab, number>();
  for (const booking of bookings) counts.set(tabOf(booking.status), (counts.get(tabOf(booking.status)) ?? 0) + 1);
  const shown = sortForTab(tab, bookings);

  return (
    <>
      <div className="eyebrow"><span className="eyebrow-dot" />{business.name}</div>
      <h1>Bookings</h1>
      <p className="auth-lead">Requests customers have made from your page. Confirm or decline each one; a confirmed booking can be followed by a payment request. Customers pay you directly.</p>
      {!business.isPublished && <p className="auth-hint">Your page isn&rsquo;t public yet, so nobody can ask to book. &ldquo;Request to book&rdquo; appears on every priced offering once it is.</p>}

      <nav className="bkg-tabs" aria-label="Booking requests by status">
        {BOOKING_TABS.map((t) => (
          <Link key={t} href={t === "new" ? basePath : `${basePath}?tab=${t}`} aria-current={t === tab ? "page" : undefined}>
            {BOOKING_TAB_LABEL[t]}{(counts.get(t) ?? 0) > 0 ? <span>{counts.get(t)}</span> : null}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="auth-lead bkg-empty">
          {tab === "new" ? "No new requests." : tab === "confirmed" ? "Nothing confirmed and still to come." : tab === "done" ? "Nothing marked done yet." : "Nothing declined or cancelled."}
          {tab === "new" && bookings.length === 0 && publicHref && business.isPublished ? <> Customers ask from <a href={publicHref}>your page</a>: every offering with a price has a &ldquo;Request to book&rdquo; button.</> : null}
        </p>
      ) : (
        <ul className="bkg-list">
          {shown.map((b) => {
            const payment = b.paymentRequestId === null ? null : payments.get(b.paymentRequestId) ?? null;
            const openPayment = payment !== null && payment.status !== "void";
            const first = b.customerName.trim().split(/\s+/)[0] ?? "";
            const wa = whatsAppLink(b.customerPhone, bookingWhatsAppText({ businessName: business.name, customerName: b.customerName, referenceCode: b.referenceCode, offeringName: b.offeringName, requestedDate: b.requestedDate, requestedTime: b.requestedTime }));
            return (
              <li key={b.id} className={`bkg-card is-${b.status}`}>
                <div className="bkg-card-head">
                  <div>
                    <strong>{b.offeringName}</strong>
                    <span>{formatWhen(b.requestedDate, b.requestedTime)}</span>
                  </div>
                  <div className="bkg-card-ref">
                    <code>{b.referenceCode}</code>
                    <b>{BOOKING_STATUS_LABEL[b.status]}</b>
                  </div>
                </div>
                <dl className="bkg-facts">
                  <div><dt>Customer</dt><dd>{b.customerName}</dd></div>
                  <div><dt>Phone</dt><dd><a href={`tel:${b.customerPhone}`}>{formatPhoneDisplay(b.customerPhone)}</a></dd></div>
                  <div><dt>Email</dt><dd><a href={`mailto:${b.customerEmail}`}>{b.customerEmail}</a></dd></div>
                  {b.childFirstName && <div><dt>For</dt><dd>{b.childFirstName} (booked by their parent or guardian)</dd></div>}
                  {b.durationOrQty && <div><dt>How many</dt><dd>{b.durationOrQty}</dd></div>}
                  {b.locationText && <div><dt>Where</dt><dd>{b.locationText}</dd></div>}
                  {b.notes && <div><dt>Notes</dt><dd className="bkg-notes">{b.notes}</dd></div>}
                  {b.priceCents !== null && <div><dt>Price</dt><dd>{formatPrice(b.priceCents, b.priceUnit)} when asked</dd></div>}
                  {b.status === "declined" && b.declinedReason && <div><dt>Reason</dt><dd>{b.declinedReason}</dd></div>}
                  <div><dt>Asked</dt><dd>{asked(b.createdAt)}{b.handledByName && b.status !== "new" && b.status !== "cancelled" ? ` · ${BOOKING_STATUS_LABEL[b.status].toLowerCase()} by ${b.handledByName}` : ""}</dd></div>
                </dl>
                {payment && <PaymentLine payment={payment} paymentsPath={paymentsPath} />}
                <BookingActions endpoint={`${apiBase}/${b.id}`} status={b.status} customerFirstName={first} />
                <div className="bkg-links">
                  {(b.status === "confirmed" || b.status === "done") && paymentsPath && !openPayment && (
                    <Link className="bkg-link-strong" href={`${paymentsPath}/new?booking=${b.id}`}>Request payment →</Link>
                  )}
                  {/* Opens this team member's own WhatsApp with the reference
                      filled in. PortPass sends nothing. */}
                  {b.status !== "cancelled" && <a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp {first || "the customer"}</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="auth-alt"><Link href={homeHref}>Back to my business</Link></p>
    </>
  );
}
