import { describe, expect, it } from "vitest";
import { paymentErrorMessage, parseMarkPaidInput, parseRequestInput, parseSettingsInput } from "./input";
import { viaPortpassFrom, paymentEmail } from "./email";

const today = "2026-10-01";
const all = { methodsAvailable: ["bank_transfer", "cash", "kanoo_wallet_manual"] as const, today };
const base = {
  customerName: "  TEST — delete Parent ",
  customerPhone: "242-555-0100",
  customerEmail: "",
  lines: [{ label: "Term fee", qty: 1, unitCents: 42000 }, { label: "Kit", qty: 2, unitCents: 1500 }],
  dueDate: "2026-10-09",
  methods: ["bank_transfer", "cash"],
  allowPartPayment: true,
};

describe("a new request", () => {
  it("is cleaned up and totalled on the server", () => {
    const parsed = parseRequestInput(base, { ...all, methodsAvailable: [...all.methodsAvailable] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.customerName).toBe("TEST — delete Parent");
    expect(parsed.value.customerPhone).toBe("+12425550100");
    expect(parsed.value.customerEmail).toBeNull();
    expect(parsed.value.totalCents).toBe(45000);
    expect(parsed.value.allowPartPayment).toBe(true);
  });

  it("needs a way to reach the customer, real lines and a due date that isn't past", () => {
    const opts = { ...all, methodsAvailable: [...all.methodsAvailable] };
    const err = (body: Record<string, unknown>) => {
      const parsed = parseRequestInput({ ...base, ...body }, opts);
      return parsed.ok ? null : parsed.error;
    };
    expect(err({ customerPhone: "", customerEmail: "" })).toBe("NEEDS_CONTACT");
    expect(err({ customerPhone: "12" })).toBe("BAD_PHONE");
    expect(err({ customerEmail: "not-an-email" })).toBe("BAD_EMAIL");
    expect(err({ lines: [] })).toBe("NEEDS_LINES");
    expect(err({ lines: [{ label: "", qty: 1, unitCents: 100 }] })).toBe("LINE_NEEDS_LABEL");
    expect(err({ lines: [{ label: "x", qty: 1, unitCents: 0 }] })).toBe("ZERO_TOTAL");
    expect(err({ lines: [{ label: "x", qty: 1.5, unitCents: 100 }] })).toBe("BAD_QTY");
    expect(err({ lines: [{ label: "x", qty: 1, unitCents: -1 }] })).toBe("BAD_PRICE");
    expect(err({ dueDate: "2026-09-30" })).toBe("DUE_DATE_PAST");
    expect(err({ dueDate: "2026-02-30" })).toBe("BAD_DUE_DATE");
    expect(err({ registrationId: 1, reservationId: 2 })).toBe("ONE_LINK");
  });

  it("keeps an existing request's past due date when it is changed", () => {
    const parsed = parseRequestInput({ ...base, dueDate: "2026-09-20" }, { ...all, methodsAvailable: [...all.methodsAvailable], existingDueDate: "2026-09-20" });
    expect(parsed.ok).toBe(true);
  });

  it("offers only methods the business has set up, and never card", () => {
    const parsed = parseRequestInput({ ...base, methods: ["bank_transfer"] }, { methodsAvailable: ["cash"], today });
    expect(parsed.ok ? null : parsed.error).toBe("METHOD_NOT_SET_UP");
    const card = parseRequestInput({ ...base, methods: ["card"] }, { ...all, methodsAvailable: [...all.methodsAvailable] });
    expect(card.ok ? null : card.error).toBe("NEEDS_METHOD");
    const kanooLink = parseRequestInput({ ...base, methods: ["kanoo_link", "cash"] }, { ...all, methodsAvailable: [...all.methodsAvailable] });
    expect(kanooLink.ok && kanooLink.value.methods).toEqual(["cash"]);
  });
});

describe("mark paid", () => {
  it("takes the amount, method, day received and reference", () => {
    const parsed = parseMarkPaidInput({ amountCents: 20000, method: "bank_transfer", receivedOn: "2026-09-29", reference: " T-123 " }, today);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.reference).toBe("T-123");
    // Noon in Nassau on that day.
    expect(parsed.value.receivedAt).toBe("2026-09-29T16:00:00.000Z");
  });

  it("refuses a future day, card, and a non-amount", () => {
    const err = (body: Record<string, unknown>) => {
      const parsed = parseMarkPaidInput({ amountCents: 100, method: "cash", receivedOn: today, ...body }, today);
      return parsed.ok ? null : parsed.error;
    };
    expect(err({ receivedOn: "2026-10-02" })).toBe("BAD_RECEIVED_DATE");
    expect(err({ method: "card" })).toBe("BAD_METHOD");
    expect(err({ amountCents: 0 })).toBe("BAD_AMOUNT");
    expect(err({})).toBeNull();
  });
});

describe("how customers pay", () => {
  it("keeps only the last four digits of an account number in its own field", () => {
    const ok = parseSettingsInput({ referencePrefix: "fp", accountNumberLast4: "12 34", bankName: "TEST Bank", accountName: "TEST Kickers", defaultDueDays: 14, acceptedMethods: ["bank_transfer", "cash"] });
    expect(ok.ok && ok.value).toMatchObject({ referencePrefix: "FP", accountNumberLast4: "1234", defaultDueDays: 14, acceptedMethods: ["bank_transfer", "cash"] });
    const full = parseSettingsInput({ referencePrefix: "FP", accountNumberLast4: "000123456789" });
    expect(full.ok ? null : full.error).toBe("LAST4_ONLY");
    expect(paymentErrorMessage("LAST4_ONLY")).toContain("last four");
    const prefix = parseSettingsInput({ referencePrefix: "F" });
    expect(prefix.ok ? null : prefix.error).toBe("BAD_PREFIX");
  });

  it("needs at least one real method, each with its details, and never a card", () => {
    const err = (body: Record<string, unknown>) => {
      const parsed = parseSettingsInput({ referencePrefix: "FP", ...body });
      return parsed.ok ? null : parsed.error;
    };
    expect(err({})).toBe("NEEDS_GET_PAID_METHOD");
    expect(err({ acceptedMethods: [] })).toBe("NEEDS_GET_PAID_METHOD");
    expect(err({ acceptedMethods: ["cash"] })).toBeNull();
    expect(err({ acceptedMethods: ["card"] })).toBe("METHOD_NOT_AVAILABLE");
    expect(err({ acceptedMethods: ["cash", "kanoo_link"] })).toBe("METHOD_NOT_AVAILABLE");
    expect(paymentErrorMessage("METHOD_NOT_AVAILABLE")).toMatch(/Card payments are coming/);
    expect(err({ acceptedMethods: ["bank_transfer"], bankName: "TEST Bank" })).toBe("BANK_NEEDS_DETAILS");
    expect(err({ acceptedMethods: ["bank_transfer"], bankName: "TEST Bank", accountName: "TEST", accountNumberLast4: "0042" })).toBeNull();
    expect(err({ acceptedMethods: ["bank_transfer"], bankName: "TEST Bank", accountName: "TEST", transferInstructions: "TEST transit 00000" })).toBeNull();
    expect(err({ acceptedMethods: ["kanoo_wallet_manual"] })).toBe("KANOO_NEEDS_HANDLE");
    expect(err({ acceptedMethods: ["kanoo_wallet_manual"], kanooHandleOrPhone: "242 555 0100" })).toBeNull();
  });
});

describe("payment emails", () => {
  it("come from the business, via PortPass's own address", () => {
    expect(viaPortpassFrom("Futprep Athletics", "PortPass <hello@portpassbahamas.com>")).toBe("\"Futprep Athletics via PortPass\" <hello@portpassbahamas.com>");
    expect(viaPortpassFrom("Odd \"Name\" <x>\r\nBcc: y", "hello@portpassbahamas.com")).toBe("\"Odd Name xBcc: y via PortPass\" <hello@portpassbahamas.com>");
    expect(viaPortpassFrom("Anything", undefined)).toBeUndefined();
  });

  it("say pay the business directly, link to the page, and never mention cards", () => {
    const input = { kind: "request" as const, businessName: "TEST Futprep", customerName: "TEST Parent", referenceCode: "FP-0042", lines: [{ label: "Lil Kickers term fee — Amara", qty: 1, unitCents: 42000 }], totalCents: 42000, paidCents: 0, balanceCents: 42000, dueDate: "2026-10-09", payUrl: "https://portpassbahamas.com/pay/abc" };
    const request = paymentEmail(input, today);
    expect(request.subject).toBe("Payment request FP-0042 from TEST Futprep");
    expect(request.html).toContain("Pay TEST Futprep directly. PortPass never holds your money.");
    expect(request.html).toContain("https://portpassbahamas.com/pay/abc");
    const reminder = paymentEmail({ ...input, kind: "reminder" }, today);
    const receipt = paymentEmail({ ...input, kind: "receipt", paidCents: 42000, balanceCents: 0, receipt: { number: "FP-R0001", amountCents: 42000, url: "https://x/r" } }, today);
    expect(receipt.subject).toBe("Receipt FP-R0001 from TEST Futprep");
    for (const mail of [request, reminder, receipt]) expect(`${mail.subject} ${mail.html}`).not.toMatch(/\bcard\b|pay now/i);
  });
});
