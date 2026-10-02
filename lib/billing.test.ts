import { describe, expect, it } from "vitest";
import {
  accountStatus,
  addDays,
  addMonths,
  annualPriceCents,
  bankDetailsComplete,
  cleanBankDetails,
  daysOverdue,
  eventLine,
  eventsToInvoice,
  feeCents,
  feeOutlook,
  firstInvoiceOn,
  freeUntil,
  howToPay,
  invoiceNumber,
  invoiceStatus,
  invoiceTotals,
  isDay,
  monthlyRecurringCents,
  morningSummary,
  needsFounderCall,
  nextInvoiceOn,
  nextPeriodStartOn,
  owedCents,
  periodFitsCycle,
  periodLabel,
  periodsToDraft,
  remindersDue,
  revenueSummary,
  setupDueCents,
  shownToBusiness,
  subscriptionLines,
  subscriptionPeriod,
  type BillingAccount,
  type BillingEvent,
  type Invoice,
} from "./billing";

const account = (over: Partial<BillingAccount> = {}): BillingAccount => ({
  organizationId: 7, planCode: "solo", cycle: "monthly", priceCents: 6500, annualMonthsCharged: 10, retainerCents: 0, extraLocations: 0, extraLocationCents: 2500, commissionBps: 0,
  goLiveOn: "2026-10-05", freeMonthsCredit: 0, creditReason: null, freeUntilOverride: null, freeUntilOverrideReason: null, billingResumesOn: null, setupFeeCents: 45000, setupStatus: "waived",
  agreementSignedOn: null, agreementVersion: null, billingEmail: "test-delete-owner@test.portpass.local", billingWhatsappE164: null, paused: false, ended: false, notes: null, ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({ id: 1, number: "PP-2026-001", organizationId: 7, kind: "subscription", periodStart: "2026-11-05", periodEnd: "2026-12-04", issuedOn: "2026-11-05", dueOn: "2026-11-19", status: "sent", subtotalCents: 6500, vatCents: 0, totalCents: 6500, paidCents: 0, sentAt: "2026-11-05T12:00:00Z", sentVia: "email", voidReason: null, ...over });

describe("calendar days", () => {
  it("knows a real date from a made-up one", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("05/11/2026")).toBe(false);
  });

  it("bills a 31st on the last day of a shorter month, and does not drift afterwards", () => {
    expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    // Anchored on the 31st: January, February (28th), March (31st again).
    expect([0, 1, 2].map((n) => subscriptionPeriod("2026-01-31", "monthly", n).start)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(addMonths("2026-11-15", 14)).toBe("2028-01-15");
  });

  it("writes a period the way the invoice shows it", () => {
    expect(periodLabel("2026-10-01", "2026-10-31")).toBe("1–31 October 2026");
    expect(periodLabel("2026-11-05", "2026-12-04")).toBe("5 November – 4 December 2026");
    expect(periodLabel("2026-12-15", "2027-01-14")).toBe("15 December 2026 – 14 January 2027");
    // An invoice for one day (a one-off) reads as that day, not "5–5 October".
    expect(periodLabel("2026-10-05", "2026-10-05")).toBe("5 October 2026");
  });
});

describe("the free period and the first invoice", () => {
  it("is 30 days from go-live, and the first invoice is the day after", () => {
    const solo = account({ goLiveOn: "2026-10-05" });
    expect(freeUntil(solo)).toBe("2026-11-04");
    expect(firstInvoiceOn(solo)).toBe("2026-11-05");
    expect(subscriptionLines(solo, "Solo", subscriptionPeriod("2026-11-05", "monthly", 0), { firstInvoice: true })).toEqual([{ description: "Solo plan, monthly: 5 November – 4 December 2026", qty: 1, unitCents: 6500, amountCents: 6500, source: "plan" }]);
  });

  it("moves by two months with a two-month credit", () => {
    const credited = account({ goLiveOn: "2026-10-05", freeMonthsCredit: 2, creditReason: "TEST signage sponsor: banner" });
    expect(freeUntil(credited)).toBe("2027-01-04");
    expect(firstInvoiceOn(credited)).toBe("2027-01-05");
  });

  it("uses a founder's own date when one is set, and is nothing before go-live", () => {
    expect(freeUntil(account({ goLiveOn: "2026-09-12", freeUntilOverride: "2026-12-05", freeUntilOverrideReason: "TEST Term 1 free, founding client" }))).toBe("2026-12-05");
    expect(freeUntil(account({ goLiveOn: null }))).toBeNull();
    expect(firstInvoiceOn(account({ goLiveOn: null }))).toBeNull();
  });
});

describe("what a subscription invoice charges", () => {
  it("annual Growing is ten months for the year, with setup waived", () => {
    const growing = account({ planCode: "growing", cycle: "annual", priceCents: 12000, setupStatus: "due" });
    expect(annualPriceCents(growing)).toBe(120000);
    expect(setupDueCents(growing)).toBe(0);
    const lines = subscriptionLines(growing, "Growing", subscriptionPeriod("2026-11-05", "annual", 0), { firstInvoice: true });
    expect(lines).toEqual([{ description: "Growing plan, annual (10 months charged for 12): 5 November 2026 – 4 November 2027", qty: 1, unitCents: 120000, amountCents: 120000, source: "plan" }]);
    expect(invoiceTotals(lines)).toEqual({ subtotalCents: 120000, vatCents: 0, totalCents: 120000 });
  });

  it("adds setup once, on the first monthly invoice only, and the retainer and extra locations every time", () => {
    const business = account({ planCode: "business", priceCents: 22000, retainerCents: 75000, extraLocations: 2, setupStatus: "due" });
    const first = subscriptionLines(business, "Business", subscriptionPeriod("2026-11-05", "monthly", 0), { firstInvoice: true });
    expect(first.map((l) => [l.source, l.amountCents])).toEqual([["plan", 22000], ["retainer", 75000], ["extra_location", 5000], ["setup", 45000]]);
    const second = subscriptionLines(business, "Business", subscriptionPeriod("2026-11-05", "monthly", 1), { firstInvoice: false });
    expect(second.map((l) => l.source)).toEqual(["plan", "retainer", "extra_location"]);
    expect(invoiceTotals(first).totalCents).toBe(147000);
  });
});

describe("when the next invoice goes out", () => {
  const november = { periodStart: "2026-11-05", periodEnd: "2026-12-04" };
  const december = { periodStart: "2026-12-05", periodEnd: "2027-01-04" };

  it("is the first invoice date during the free period, then each month after", () => {
    const solo = account({ goLiveOn: "2026-10-05" });
    expect(nextInvoiceOn(solo, "2026-10-20")).toBe("2026-11-05");
    // Due today and not raised yet: today.
    expect(nextInvoiceOn(solo, "2026-11-05")).toBe("2026-11-05");
    expect(nextInvoiceOn(solo, "2026-11-05", [november])).toBe("2026-12-05");
    expect(nextInvoiceOn(account({ goLiveOn: "2026-10-05", cycle: "annual" }), "2026-11-06", [{ periodStart: "2026-11-05", periodEnd: "2027-11-04" }])).toBe("2027-11-05");
  });

  it("catches up every missed period, not one", () => {
    const solo = account({ goLiveOn: "2026-10-05" });
    expect(periodsToDraft(solo, [], "2027-01-20")).toEqual([{ start: "2026-11-05", end: "2026-12-04" }, { start: "2026-12-05", end: "2027-01-04" }, { start: "2027-01-05", end: "2027-02-04" }]);
    expect(periodsToDraft(solo, [november], "2027-01-20").map((p) => p.start)).toEqual(["2026-12-05", "2027-01-05"]);
    expect(nextInvoiceOn(solo, "2027-01-20", [november])).toBe("2026-12-05");
    // Nothing during the free period, and nothing for a business that isn't on a plan.
    expect(periodsToDraft(solo, [], "2026-11-04")).toEqual([]);
    expect(periodsToDraft(account({ cycle: "commission_monthly" }), [], "2027-01-20")).toEqual([]);
  });

  it("keeps going after three years: the schedule runs on from the last invoice, not from the start", () => {
    const solo = account({ goLiveOn: "2026-10-05" });
    const fortyMonths = [{ periodStart: "2030-02-05", periodEnd: "2030-03-04" }];
    expect(periodsToDraft(solo, fortyMonths, "2030-03-05")).toEqual([{ start: "2030-03-05", end: "2030-04-04" }]);
  });

  it("stays on the 31st through shorter months", () => {
    const end31 = account({ goLiveOn: "2026-12-01" });
    // Free until 31 December; first invoice 1 January... so use an override to land on the 31st.
    const on31 = account({ goLiveOn: null, freeUntilOverride: "2027-01-30", freeUntilOverrideReason: "TEST" });
    expect(periodsToDraft(on31, [], "2027-04-01").map((p) => p.start)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(periodsToDraft(on31, [{ periodStart: "2027-01-31", periodEnd: "2027-02-27" }], "2027-04-01").map((p) => p.start)).toEqual(["2027-02-28", "2027-03-31"]);
    expect(nextPeriodStartOn(end31, [])).toBe("2027-01-01");
  });

  it("never re-bills or skips when the account is changed after invoices exist", () => {
    // Monthly to annual in January: the year starts where the last month ended.
    const nowAnnual = account({ goLiveOn: "2026-10-05", cycle: "annual" });
    expect(periodsToDraft(nowAnnual, [november, december], "2027-01-20")).toEqual([{ start: "2027-01-05", end: "2028-01-04" }]);
    // Annual to monthly in April: nothing until the paid year is over.
    const nowMonthly = account({ goLiveOn: "2026-10-05", cycle: "monthly" });
    expect(periodsToDraft(nowMonthly, [{ periodStart: "2026-11-05", periodEnd: "2027-11-04" }], "2027-04-20")).toEqual([]);
    expect(nextPeriodStartOn(nowMonthly, [{ periodStart: "2026-11-05", periodEnd: "2027-11-04" }])).toBe("2027-11-05");
    // Free months given after billing started push the next invoice back.
    const credited = account({ goLiveOn: "2026-10-05", freeMonthsCredit: 2, creditReason: "TEST banner", billingResumesOn: "2027-03-05" });
    expect(periodsToDraft(credited, [november, december], "2027-02-20")).toEqual([]);
    expect(periodsToDraft(credited, [november, december], "2027-03-05")).toEqual([{ start: "2027-03-05", end: "2027-04-04" }]);
  });

  it("does not bill the time an account was paused: it resumes from the day it was un-paused", () => {
    const resumed = account({ goLiveOn: "2026-10-05", billingResumesOn: "2027-04-20" });
    expect(periodsToDraft(resumed, [november, december], "2027-04-20")).toEqual([{ start: "2027-04-20", end: "2027-05-19" }]);
    // And then monthly from the 20th.
    expect(periodsToDraft(resumed, [november, december, { periodStart: "2027-04-20", periodEnd: "2027-05-19" }], "2027-05-20")).toEqual([{ start: "2027-05-20", end: "2027-06-19" }]);
  });

  it("knows a month from a year, so a period is never billed again at the other cycle's price", () => {
    expect(periodFitsCycle("monthly", "2026-11-05", "2026-12-04")).toBe(true);
    expect(periodFitsCycle("monthly", "2027-01-31", "2027-02-27")).toBe(true);
    expect(periodFitsCycle("monthly", "2027-04-05", "2028-04-04")).toBe(false);
    expect(periodFitsCycle("annual", "2027-04-05", "2028-04-04")).toBe(true);
    expect(periodFitsCycle("annual", "2026-11-05", "2026-12-04")).toBe(false);
    expect(periodFitsCycle("per_event", "2026-11-05", "2026-12-04")).toBe(false);
  });

  it("is the 1st of next month for fees per booking or wedding, and nothing for a plan not agreed, a paused or an ended account", () => {
    expect(nextInvoiceOn(account({ cycle: "commission_monthly", priceCents: 0, commissionBps: 800 }), "2026-10-20")).toBe("2026-11-01");
    expect(nextInvoiceOn(account({ cycle: "per_event" }), "2026-10-20")).toBe("2026-11-01");
    expect(nextInvoiceOn(account({ cycle: "not_agreed" }), "2026-10-20")).toBeNull();
    expect(nextInvoiceOn(account({ paused: true }), "2026-10-20")).toBeNull();
    expect(nextInvoiceOn(account({ ended: true }), "2026-10-20")).toBeNull();
  });
});

describe("fees earned per booking or wedding", () => {
  const event = (over: Partial<BillingEvent>): BillingEvent => ({ id: 1, organizationId: 7, kind: "marketplace_commission", eventOn: "2026-11-10", bookingValueCents: 50000, rateBps: 800, flatCents: 0, feeCents: 4000, invoiceLineId: null, note: null, ...over });

  it("works out a percentage, a flat fee, or both, in whole cents", () => {
    expect(feeCents({ bookingValueCents: 50000, rateBps: 800, flatCents: 0 })).toBe(4000);
    expect(feeCents({ bookingValueCents: 0, rateBps: 0, flatCents: 15000 })).toBe(15000);
    expect(feeCents({ bookingValueCents: 33333, rateBps: 1500, flatCents: 0 })).toBe(5000);
  });

  it("invoices only what happened after the free period, before the invoice date, and is not on an invoice already", () => {
    const marketplace = account({ cycle: "commission_monthly", priceCents: 0, commissionBps: 800, goLiveOn: "2026-10-05" });
    const picked = eventsToInvoice(
      [
        event({ id: 1, eventOn: "2026-11-03" }), // inside the free period (ends 4 November)
        event({ id: 2, eventOn: "2026-11-10" }),
        event({ id: 3, eventOn: "2026-11-20", invoiceLineId: 99 }), // already invoiced
        event({ id: 4, eventOn: "2026-12-01" }), // next month's
        event({ id: 5, eventOn: "2026-11-25", feeCents: 0 }), // cancelled and refunded before invoicing
      ],
      marketplace,
      "2026-12-01",
    );
    expect(picked.map((e) => e.id)).toEqual([2]);
  });

  it("keeps the fees' free period where it was when free months are given after billing started", () => {
    const credited = account({ goLiveOn: "2026-10-05", freeMonthsCredit: 2, creditReason: "TEST banner", billingResumesOn: "2027-03-05" });
    const billedFrom = [{ periodStart: "2026-11-05", periodEnd: "2026-12-04" }];
    const december = event({ id: 9, eventOn: "2026-12-10" });
    // Read from the account alone, the free period would now run to 4 January...
    expect(eventsToInvoice([december], credited, "2027-01-01")).toEqual([]);
    // ...but the business has been billed from 5 November: December's fee is owed.
    expect(eventsToInvoice([december], credited, "2027-01-01", billedFrom).map((e) => e.id)).toEqual([9]);
    // A fee inside the free period it really had stays free.
    expect(eventsToInvoice([event({ id: 10, eventOn: "2026-11-03" })], credited, "2027-01-01", billedFrom)).toEqual([]);
  });

  it("says truthfully what will happen to a fee or a credit", () => {
    const plan = account({ goLiveOn: "2026-10-05" });
    expect(feeOutlook({ eventOn: "2026-11-10", feeCents: 15000 }, plan)).toBe("invoiced_next");
    expect(feeOutlook({ eventOn: "2026-10-20", feeCents: 15000 }, plan)).toBe("free_period");
    expect(feeOutlook({ eventOn: "2026-11-10", feeCents: -1000 }, plan)).toBe("credit_waits");
    expect(feeOutlook({ eventOn: "2026-11-10", feeCents: 15000 }, null)).toBe("no_plan");
    expect(feeOutlook({ eventOn: "2026-11-10", feeCents: 15000 }, account({ cycle: "not_agreed" }))).toBe("no_plan");
    expect(feeOutlook({ eventOn: "2026-11-10", feeCents: 15000 }, account({ paused: true }))).toBe("no_plan");
  });

  it("writes the line a business can check: what, how much of what, and when", () => {
    expect(eventLine(event({ id: 2 }))).toEqual({ description: "Marketplace commission (8% of $500, 10 November 2026)", qty: 1, unitCents: 4000, amountCents: 4000, source: "commission", billingEventId: 2 });
    expect(eventLine(event({ id: 3, kind: "wedding_coordination", rateBps: 0, bookingValueCents: 0, flatCents: 15000, feeCents: 15000, note: "TEST delete wedding" }))).toMatchObject({ description: "Wedding coordination fee: TEST delete wedding (10 November 2026)", amountCents: 15000, source: "wedding_fee" });
    // A refund after invoicing comes back as a credit on the next invoice.
    expect(eventLine(event({ id: 4, feeCents: -4000 })).amountCents).toBe(-4000);
  });
});

describe("an invoice's number, status and what is owed", () => {
  it("numbers invoices PP-YEAR-NNN", () => {
    expect(invoiceNumber(2026, 1)).toBe("PP-2026-001");
    expect(invoiceNumber(2027, 1234)).toBe("PP-2027-1234");
  });

  it("goes sent, part paid, paid; overdue the day after it was due; a draft or a void never changes", () => {
    expect(invoiceStatus(invoice(), "2026-11-19")).toBe("sent");
    expect(invoiceStatus(invoice(), "2026-11-20")).toBe("overdue");
    expect(invoiceStatus(invoice({ paidCents: 3000 }), "2026-11-10")).toBe("part_paid");
    expect(invoiceStatus(invoice({ paidCents: 3000 }), "2026-11-25")).toBe("overdue");
    expect(invoiceStatus(invoice({ paidCents: 6500 }), "2026-12-25")).toBe("paid");
    expect(invoiceStatus(invoice({ status: "draft" }), "2026-12-25")).toBe("draft");
    expect(invoiceStatus(invoice({ status: "void" }), "2026-12-25")).toBe("void");
    expect(owedCents(invoice({ paidCents: 3000 }))).toBe(3500);
    expect(owedCents(invoice({ status: "draft" }))).toBe(0);
    expect(daysOverdue(invoice(), "2026-11-26")).toBe(7);
    expect(daysOverdue(invoice({ paidCents: 6500 }), "2026-11-26")).toBe(0);
  });

  it("puts the account past due while anything is overdue", () => {
    const solo = account({ goLiveOn: "2026-10-05" });
    expect(accountStatus(account({ goLiveOn: null }), [], "2026-10-20")).toBe("not_live");
    expect(accountStatus(solo, [], "2026-11-04")).toBe("trial");
    expect(accountStatus(solo, [], "2026-11-05")).toBe("active");
    expect(accountStatus(solo, [invoice()], "2026-11-20")).toBe("past_due");
    expect(accountStatus(solo, [invoice({ paidCents: 6500 })], "2026-11-20")).toBe("active");
    expect(accountStatus(account({ paused: true }), [invoice()], "2026-11-20")).toBe("paused");
    expect(accountStatus(account({ ended: true }), [], "2026-11-20")).toBe("ended");
  });

  it("is not live before its go-live date, and never a free period again once it has been invoiced", () => {
    expect(accountStatus(account({ goLiveOn: "2026-11-15" }), [], "2026-10-01")).toBe("not_live");
    expect(accountStatus(account({ goLiveOn: "2026-11-15" }), [], "2026-11-15")).toBe("trial");
    // Two free months given in December, after the November invoice: still active.
    const credited = account({ goLiveOn: "2026-10-05", freeMonthsCredit: 2, creditReason: "TEST banner" });
    expect(accountStatus(credited, [], "2026-12-20")).toBe("trial");
    expect(accountStatus(credited, [invoice({ paidCents: 6500 })], "2026-12-20", true)).toBe("active");
  });

  it("shows a business its sent, paid and void-after-sending invoices, never a draft or one voided before it went", () => {
    expect(shownToBusiness(invoice())).toBe(true);
    expect(shownToBusiness(invoice({ status: "draft", sentAt: null }))).toBe(false);
    expect(shownToBusiness(invoice({ status: "void", sentAt: null }))).toBe(false);
    expect(shownToBusiness(invoice({ status: "void" }))).toBe(true);
    // Billed before this system: recorded as sent, with no sent time here.
    expect(shownToBusiness(invoice({ kind: "historical", status: "sent", sentAt: null }))).toBe(true);
  });
});

describe("reminder emails", () => {
  const solo = account({ goLiveOn: "2026-10-05" });

  it("tells the owner 7 days and 1 day before the free period ends, on those days only", () => {
    expect(remindersDue(solo, [], "2026-10-28").map((r) => r.kind)).toEqual(["trial_ends_7"]);
    expect(remindersDue(solo, [], "2026-11-03").map((r) => r.kind)).toEqual(["trial_ends_1"]);
    expect(remindersDue(solo, [], "2026-10-29")).toEqual([]);
    // No plan or price agreed: there is nothing true to say.
    expect(remindersDue(account({ goLiveOn: "2026-10-05", cycle: "not_agreed" }), [], "2026-10-28")).toEqual([]);
    expect(remindersDue(account({ goLiveOn: "2026-10-05", priceCents: 0 }), [], "2026-10-28")).toEqual([]);
  });

  it("never tells a business already being invoiced that its free period is ending", () => {
    // Two free months given after the November invoice: "free until" is now 4 January.
    const credited = account({ goLiveOn: "2026-10-05", freeMonthsCredit: 2, creditReason: "TEST banner" });
    expect(remindersDue(credited, [], "2026-12-28").map((r) => r.kind)).toEqual(["trial_ends_7"]);
    expect(remindersDue(credited, [], "2026-12-28", true)).toEqual([]);
    expect(remindersDue(credited, [], "2027-01-03", true)).toEqual([]);
  });

  it("never chases something billed before this system", () => {
    const old = invoice({ kind: "historical", number: "TEST-BUILD", sentAt: null });
    for (const day of ["2026-11-16", "2026-11-20", "2026-11-26"]) expect(remindersDue(solo, [old], day)).toEqual([]);
  });

  it("reminds 3 days before due, 1 day and 7 days overdue, and stops at 14: a founder calls instead", () => {
    const sent = invoice();
    expect(remindersDue(solo, [sent], "2026-11-16").map((r) => r.kind)).toEqual(["invoice_due_3"]);
    expect(remindersDue(solo, [sent], "2026-11-20").map((r) => r.kind)).toEqual(["invoice_overdue_1"]);
    expect(remindersDue(solo, [sent], "2026-11-26").map((r) => r.kind)).toEqual(["invoice_overdue_7"]);
    for (const day of ["2026-12-03", "2026-12-04", "2026-12-20"]) expect(remindersDue(solo, [sent], day)).toEqual([]);
    expect(needsFounderCall(sent, "2026-12-02")).toBe(false);
    expect(needsFounderCall(sent, "2026-12-03")).toBe(true);
  });

  it("never chases a paid, draft or void invoice, or a paused account", () => {
    expect(remindersDue(solo, [invoice({ paidCents: 6500 })], "2026-11-20")).toEqual([]);
    expect(remindersDue(solo, [invoice({ status: "draft" })], "2026-11-20")).toEqual([]);
    expect(remindersDue(solo, [invoice({ status: "void" })], "2026-11-20")).toEqual([]);
    expect(remindersDue(account({ paused: true }), [invoice()], "2026-11-20")).toEqual([]);
  });

  it("gives each reminder a key, so a job that runs twice sends once", () => {
    const [once] = remindersDue(solo, [invoice()], "2026-11-20");
    const [again] = remindersDue(solo, [invoice()], "2026-11-20");
    expect(once.key).toBe("invoice_overdue_1:1");
    expect(again.key).toBe(once.key);
    expect(remindersDue(solo, [], "2026-10-28")[0].key).toBe("trial_ends_7:7:2026-11-04");
  });
});

describe("revenue", () => {
  it("counts recurring money now, and once the free periods end", () => {
    const rows = [
      { account: account({ priceCents: 6500 }), status: "active" as const, freeUntil: null, nextInvoiceOn: null, owesCents: 6500, overdueCents: 6500 },
      { account: account({ cycle: "annual", priceCents: 12000 }), status: "trial" as const, freeUntil: null, nextInvoiceOn: null, owesCents: 0, overdueCents: 0 },
      { account: account({ cycle: "commission_monthly", priceCents: 0 }), status: "active" as const, freeUntil: null, nextInvoiceOn: null, owesCents: 4000, overdueCents: 0 },
      { account: account({ priceCents: 22000 }), status: "paused" as const, freeUntil: null, nextInvoiceOn: null, owesCents: 0, overdueCents: 0 },
    ];
    expect(monthlyRecurringCents(rows[1].account)).toBe(10000);
    expect(revenueSummary(rows)).toEqual({ recurringNowCents: 6500, recurringAfterTrialsCents: 16500, owedCents: 10500, overdueCents: 6500 });
  });

  it("writes the morning summary in plain words", () => {
    expect(morningSummary({ drafts: 2, overdue: 1, overdueCents: 12000, trialsEndingThisWeek: 1, founderCalls: 0 })).toBe("2 invoices ready to send · 1 overdue ($120) · 1 free period ends this week");
    expect(morningSummary({ drafts: 0, overdue: 0, overdueCents: 0, trialsEndingThisWeek: 0, founderCalls: 0 })).toBe("Nothing to do");
  });
});

describe("how a business pays PortPass", () => {
  it("is blocked until all four bank details are filled in", () => {
    expect(bankDetailsComplete(cleanBankDetails({ bank: "TEST Bank", accountName: "PortPass Bahamas Technologies", accountNumber: "", branch: "TEST" }))).toBe(false);
    expect(howToPay(cleanBankDetails({}))).toBe("[bank details: add in Settings]");
    const full = cleanBankDetails({ bank: " TEST  Bank ", accountName: "PortPass Bahamas Technologies", accountNumber: "0000000", branch: "TEST Main" });
    expect(bankDetailsComplete(full)).toBe(true);
    expect(howToPay(full)).toBe("Bank transfer to: TEST Bank · PortPass Bahamas Technologies · Account 0000000 · TEST Main");
  });

  it("has addDays for the 14-day due date", () => {
    expect(addDays("2026-11-05", 14)).toBe("2026-11-19");
  });
});
