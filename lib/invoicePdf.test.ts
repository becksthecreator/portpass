import { describe, expect, it } from "vitest";
import { invoiceReminderEmail, invoiceSentEmail, invoiceWhatsappMessage, trialEndingEmail } from "./billingEmail";
import { cleanAccount, cleanReceipt } from "./billingInput";
import { invoicePdf, type PdfInvoice } from "./invoicePdf";

const BANK = { bank: "TEST Bank", accountName: "PortPass Bahamas Technologies", accountNumber: "0000000", branch: "TEST Main" };

const invoice = (over: Partial<PdfInvoice> = {}): PdfInvoice => ({
  number: "PP-2026-001", status: "sent", issuedOn: "2026-11-05", dueOn: "2026-11-19", periodStart: "2026-11-05", periodEnd: "2026-12-04", businessName: "TEST delete Club (Nassau)",
  billTo: ["test-delete-owner@test.portpass.local", "+12425550100"], lines: [{ description: "Growing plan, monthly: 5 November – 4 December 2026", qty: 1, unitCents: 12000, amountCents: 12000 }],
  subtotalCents: 12000, vatCents: 0, totalCents: 12000, paidCents: 0, bank: BANK, ...over,
});

const text = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

describe("the invoice PDF", () => {
  it("is a well-formed PDF whose table of offsets points at its objects", () => {
    const file = text(invoicePdf(invoice()));
    expect(file.startsWith("%PDF-1.4\n")).toBe(true);
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(file)![1]);
    expect(file.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = Array.from(file.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)).map((m) => Number(m[1]));
    expect(offsets.length).toBe(6);
    offsets.forEach((offset, index) => expect(file.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`));
    // Each stream says how long it is, exactly.
    const stream = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(file)!;
    expect(stream[2].length).toBe(Number(stream[1]));
  });

  it("carries what the template has: who PortPass is, the number, the dates, the lines, the total and how to pay", () => {
    const file = text(invoicePdf(invoice()));
    for (const piece of ["PORTPASS", "INVOICE", "Business No. 196489", "PP-2026-001", "5 November 2026", "19 November 2026", "BILL TO", "Growing plan, monthly", "120.00", "TOTAL DUE \\(BSD\\)", "HOW TO PAY", "TEST Bank", "0000000", "payment reference", "never deducts its fees"]) expect(file).toContain(piece);
    // A name with brackets is escaped, so it can't break the file.
    expect(file).toContain("TEST delete Club \\(Nassau\\)");
    // VAT is a 0.00 line and nothing more.
    expect(file).not.toMatch(/VAT-registered|not registered/i);
  });

  it("says plainly when it is a draft or void, and when bank details are missing", () => {
    expect(text(invoicePdf(invoice({ status: "draft" })))).toContain("DRAFT INVOICE");
    expect(text(invoicePdf(invoice({ status: "void" })))).toContain("VOID INVOICE");
    expect(text(invoicePdf(invoice({ bank: { bank: "", accountName: "", accountNumber: "", branch: "" } })))).toContain("[bank details: add in Settings]");
  });

  it("shows what was received and the balance, and runs to a second page when it must", () => {
    const paid = text(invoicePdf(invoice({ paidCents: 5000 })));
    expect(paid).toContain("Received");
    expect(paid).toContain("70.00");
    const long = text(invoicePdf(invoice({ lines: Array.from({ length: 40 }, (_, i) => ({ description: `TEST line ${i + 1}`, qty: 1, unitCents: 100, amountCents: 100 })) })));
    expect(long).toMatch(/Count [2-9]/);
    expect(long).toContain("TEST line 40");
  });

  it("is the same file every time for the same invoice", () => {
    expect(text(invoicePdf(invoice()))).toBe(text(invoicePdf(invoice())));
  });
});

describe("billing emails", () => {
  it("tells the owner when the free period ends and what comes next, in the brief's words", () => {
    const email = trialEndingEmail({ businessName: "TEST <b>Club</b>", planName: "Growing", priceCents: 12000, annual: false, freeUntil: "2026-11-04", firstInvoiceOn: "2026-11-05" });
    expect(email.subject).toBe("TEST <b>Club</b>: your free period ends on 4 November 2026");
    expect(email.html).toContain("From 5 November 2026 your plan is Growing, $120 a month");
    expect(email.html).toContain("TEST &lt;b&gt;Club&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Club</b>");
  });

  it("gives the amount, the due date, how to pay and the reference", () => {
    const input = { businessName: "TEST Club", number: "PP-2026-001", totalCents: 12000, owedCents: 12000, dueOn: "2026-11-19", bank: BANK, dashboardUrl: "https://portpassbahamas.com/business/test-club/billing" };
    const sent = invoiceSentEmail(input);
    expect(sent.subject).toBe("PortPass invoice PP-2026-001 for TEST Club: $120, due 19 November 2026");
    expect(sent.html).toContain("Account 0000000");
    expect(sent.html).toContain("never deducts its fees");
    expect(invoiceReminderEmail("invoice_due_3", input).subject).toBe("PortPass invoice PP-2026-001 is due on 19 November 2026");
    expect(invoiceReminderEmail("invoice_overdue_1", input).html).toContain("was due yesterday");
    expect(invoiceReminderEmail("invoice_overdue_7", input).html).toContain("a week overdue");
    expect(invoiceWhatsappMessage(input)).toContain("PP-2026-001 for TEST Club is ready: $120, due 19 November 2026");
  });
});

describe("what the billing forms accept", () => {
  const base = { planCode: "solo", cycle: "monthly", priceCents: 6500, goLiveOn: "2026-10-05" };

  it("takes a plain monthly account", () => {
    const cleaned = cleanAccount({ ...base, billingEmail: " TEST-Owner@Test.PortPass.Local ", billingWhatsappE164: "242 555 0100" });
    expect(cleaned).toMatchObject({ ok: true, value: { cycle: "monthly", priceCents: 6500, annualMonthsCharged: 10, billingEmail: "test-owner@test.portpass.local", billingWhatsappE164: "+12425550100", setupStatus: "waived", paused: false } });
  });

  it("needs a reason for free months, for its own free-until date, and to pause or end", () => {
    expect(cleanAccount({ ...base, freeMonthsCredit: 2 })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, freeMonthsCredit: 2, creditReason: "TEST banner" })).toMatchObject({ ok: true });
    expect(cleanAccount({ ...base, freeUntilOverride: "2026-12-05" })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, paused: true })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, paused: true, statusReason: "TEST owner asked for a month off" })).toMatchObject({ ok: true });
  });

  it("refuses a made-up date, a negative or fractional amount, a monthly plan with no price, and a bad email", () => {
    expect(cleanAccount({ ...base, goLiveOn: "2026-02-30" })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, priceCents: -1 })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, priceCents: 65.5 })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, priceCents: 0 })).toMatchObject({ ok: false });
    expect(cleanAccount({ ...base, billingEmail: "not an address" })).toMatchObject({ ok: false });
    expect(cleanAccount({ cycle: "not_agreed", priceCents: 0 })).toMatchObject({ ok: true });
  });

  it("takes a receipt only with an amount, a method and a real date", () => {
    expect(cleanReceipt({ amountCents: 3000, method: "bank_transfer", receivedOn: "2026-12-03", reference: " TEST-REF " })).toEqual({ ok: true, value: { amountCents: 3000, method: "bank_transfer", reference: "TEST-REF", receivedOn: "2026-12-03", note: null } });
    expect(cleanReceipt({ amountCents: 0, method: "cash", receivedOn: "2026-12-03" })).toMatchObject({ ok: false });
    expect(cleanReceipt({ amountCents: 3000, method: "card", receivedOn: "2026-12-03" })).toMatchObject({ ok: false });
    expect(cleanReceipt({ amountCents: 3000, method: "cash", receivedOn: "tomorrow" })).toMatchObject({ ok: false });
  });
});
