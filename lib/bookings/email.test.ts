import { describe, expect, it } from "vitest";
import { bookingCancelledForBusinessEmail, bookingConfirmedEmail, bookingDeclinedEmail, bookingNewForBusinessEmail, bookingReceivedEmail, type BookingEmailFacts } from "./email";

const facts = (over: Partial<BookingEmailFacts> = {}): BookingEmailFacts => ({
  business: { name: "Island Booth & Co", brandColor: "#E4FB3E", theme: {} },
  customerName: "Dana Rolle",
  referenceCode: "IB-B0007",
  offeringName: "Photo booth, 3 hours",
  requestedDate: "2026-10-17",
  requestedTime: "18:00",
  durationOrQty: "3 hours",
  locationText: "Sandyport, Nassau",
  childFirstName: null,
  bookingUrl: "https://portpassbahamas.com/booking/0123456789abcdef0123456789abcdef01234567",
  ...over,
});

describe("the customer's emails", () => {
  it("received: the reference, what was asked for, and that the business confirms within a day", () => {
    const { subject, html } = bookingReceivedEmail(facts());
    expect(subject).toBe("Island Booth & Co: booking request IB-B0007 received");
    expect(html).toContain("Island Booth &amp; Co will confirm within a day.");
    expect(html).toContain("IB-B0007");
    expect(html).toContain("Photo booth, 3 hours");
    expect(html).toContain("Sat 17 Oct 2026 at 6 pm");
    expect(html).toContain("Sandyport, Nassau");
    expect(html).toContain("/booking/0123456789abcdef0123456789abcdef01234567");
    expect(html).toContain("Hi Dana,");
  });

  it("confirmed: says so, and that the business is paid directly", () => {
    const { subject, html } = bookingConfirmedEmail(facts());
    expect(subject).toBe("Confirmed: Photo booth, 3 hours with Island Booth & Co, Sat 17 Oct 2026 at 6 pm");
    expect(html).toContain("has confirmed your booking");
    expect(html).toContain("You pay Island Booth &amp; Co directly");
  });

  it("declined: carries the business's reason and says nothing is owed", () => {
    const { subject, html } = bookingDeclinedEmail({ ...facts(), reason: "Fully booked that day <sorry>" });
    expect(subject).toBe("Island Booth & Co can't take booking request IB-B0007");
    expect(html).toContain("Fully booked that day &lt;sorry&gt;");
    expect(html).toContain("Nothing is owed.");
  });

  it("uses the business's colours, with text that reads on them", () => {
    // A lime brand colour sits as the accent on navy, never under white text.
    const { html } = bookingReceivedEmail(facts());
    expect(html).toContain("background:#0D1B3D;color:#FFFFFF;border-bottom:4px solid #E4FB3E");
  });

  it("escapes everything a customer typed", () => {
    const { html } = bookingReceivedEmail(facts({ customerName: "<b>Dana</b> Rolle", offeringName: "Booth <img src=x>", durationOrQty: "<3", locationText: "\"Sandyport\"" }));
    expect(html).not.toContain("<b>Dana</b>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;3");
    expect(html).toContain("&quot;Sandyport&quot;");
  });

  it("names a child by the first name given, and never says card payments work", () => {
    const emails = [bookingReceivedEmail(facts({ childFirstName: "Maya" })), bookingConfirmedEmail(facts({ childFirstName: "Maya" })), bookingDeclinedEmail({ ...facts(), reason: "No." })];
    expect(emails[0].html).toContain(">Maya<");
    for (const { html, subject } of emails) expect(`${subject} ${html}`).not.toMatch(/\bcard\b|pay online|checkout/i);
  });
});

describe("the business's emails", () => {
  const owner = () => {
    const { bookingUrl: _customerPage, ...rest } = facts();
    void _customerPage;
    return { ...rest, bookingsUrl: "https://portpassbahamas.com/business/island-booth/bookings" };
  };

  it("new request: who asked and what for, with a link to the Bookings screen", () => {
    const { subject, html } = bookingNewForBusinessEmail(owner());
    expect(subject).toBe("New booking request IB-B0007: Photo booth, 3 hours");
    expect(html).toContain("Dana Rolle");
    expect(html).toContain("/business/island-booth/bookings");
    expect(html).toContain("you will confirm within a day");
  });

  it("never carries the customer's own page: that link is the customer's key", () => {
    for (const { html } of [bookingNewForBusinessEmail(owner()), bookingCancelledForBusinessEmail(owner())]) expect(html).not.toContain("/booking/");
  });

  it("cancelled: says there is nothing to do", () => {
    const { subject, html } = bookingCancelledForBusinessEmail(owner());
    expect(subject).toBe("Cancelled by the customer: booking request IB-B0007");
    expect(html).toContain("There is nothing to do.");
  });
});
