import { describe, expect, it } from "vitest";
import { nassauToday } from "@/lib/futprepTerms";
import {
  amountProblem,
  balanceCents,
  buildPaymentsCsv,
  buildRequestsCsv,
  canEditRequest,
  canVoidRequest,
  chaseList,
  defaultPrefix,
  deriveStatus,
  displayStatus,
  filterRequests,
  futprepFeeLine,
  getPaidProblem,
  isOverdue,
  linkExpired,
  linesSummary,
  memberHandlesPayments,
  METHOD_LIST,
  methodsSetUp,
  money,
  nassauMonth,
  parseDollars,
  paymentVolume,
  receiptMessage,
  reminderMessage,
  remindedRecently,
  REQUEST_METHODS,
  requestMessage,
  requestTotals,
  whatsappLink,
  type ExportRequest,
  type ListedRequest,
} from "./rules";

const row = (over: Partial<ListedRequest> = {}): ListedRequest => ({
  id: 1,
  referenceCode: "FP-0001",
  customerName: "TEST — delete Parent",
  customerEmail: "parent@test.portpass.local",
  customerPhone: "+12425550100",
  lines: [{ label: "Lil Kickers term fee — Amara", qty: 1, unitCents: 42000 }],
  totalCents: 42000,
  paidCents: 0,
  status: "sent",
  dueDate: "2026-10-09",
  createdAt: "2026-10-01T15:00:00Z",
  sentAt: "2026-10-01T15:01:00Z",
  customerSaysPaidAt: null,
  lastRemindedAt: null,
  ...over,
});

describe("status follows the money", () => {
  it("derives draft, sent, part paid and paid from the sum; void stays void", () => {
    expect(deriveStatus({ status: "draft", totalCents: 5000, paidCents: 0, sent: false })).toBe("draft");
    expect(deriveStatus({ status: "draft", totalCents: 5000, paidCents: 0, sent: true })).toBe("sent");
    expect(deriveStatus({ status: "sent", totalCents: 5000, paidCents: 2000, sent: true })).toBe("part_paid");
    expect(deriveStatus({ status: "part_paid", totalCents: 5000, paidCents: 5000, sent: true })).toBe("paid");
    expect(deriveStatus({ status: "void", totalCents: 5000, paidCents: 0, sent: true })).toBe("void");
  });

  it("works out the balance, and nothing is owed on a void request", () => {
    expect(balanceCents({ status: "part_paid", totalCents: 5000, paidCents: 2000 })).toBe(3000);
    expect(balanceCents({ status: "void", totalCents: 5000, paidCents: 0 })).toBe(0);
  });

  it("can be changed or voided only while no money is recorded against it", () => {
    expect(canEditRequest({ status: "sent", paidCents: 0 })).toBe(true);
    expect(canEditRequest({ status: "part_paid", paidCents: 100 })).toBe(false);
    expect(canVoidRequest({ status: "paid", paidCents: 5000 })).toBe(false);
    expect(canVoidRequest({ status: "void", paidCents: 0 })).toBe(false);
  });
});

describe("overdue is derived from the due date in Nassau time", () => {
  it("is not overdue on the due day itself, anywhere in Nassau's day", () => {
    // 2026-10-02 02:00 UTC is still 1 October, 10 pm, in Nassau (UTC-4).
    const lateEvening = nassauToday(new Date("2026-10-02T02:00:00Z"));
    expect(lateEvening).toBe("2026-10-01");
    expect(isOverdue({ status: "sent", dueDate: "2026-10-01" }, lateEvening)).toBe(false);
    // 05:00 UTC is 1 am on 2 October in Nassau: now it is overdue.
    const nextMorning = nassauToday(new Date("2026-10-02T05:00:00Z"));
    expect(isOverdue({ status: "sent", dueDate: "2026-10-01" }, nextMorning)).toBe(true);
  });

  it("only counts requests still waiting for money", () => {
    for (const status of ["draft", "paid", "void"] as const) expect(isOverdue({ status, dueDate: "2026-01-01" }, "2026-10-02")).toBe(false);
    expect(isOverdue({ status: "part_paid", dueDate: "2026-10-01" }, "2026-10-02")).toBe(true);
    expect(displayStatus({ status: "sent", dueDate: "2026-10-01" }, "2026-10-02")).toBe("overdue");
  });
});

describe("mark paid amounts", () => {
  it("never more than the balance, less only when part payments are allowed", () => {
    expect(amountProblem(5000, 5000, false)).toBeNull();
    expect(amountProblem(2000, 5000, false)).toBe("PART_NOT_ALLOWED");
    expect(amountProblem(2000, 5000, true)).toBeNull();
    expect(amountProblem(6000, 5000, true)).toBe("OVER_BALANCE");
    expect(amountProblem(0, 5000, true)).toBe("BAD_AMOUNT");
    expect(amountProblem(12.5, 5000, true)).toBe("BAD_AMOUNT");
  });

  it("reads dollars the way staff type them", () => {
    expect(parseDollars("45")).toBe(4500);
    expect(parseDollars("$1,250.5")).toBe(125050);
    expect(parseDollars("0.07")).toBe(7);
    expect(parseDollars("12.345")).toBeNull();
    expect(parseDollars("-5")).toBeNull();
  });

  it("prints money with cents, always", () => {
    expect(money(42000)).toBe("$420.00");
    expect(money(123456)).toBe("$1,234.56");
  });
});

describe("the customer's link", () => {
  it("works for 180 days after the request is paid or voided", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(linkExpired({ status: "sent", paidAt: null, voidedAt: null }, now)).toBe(false);
    expect(linkExpired({ status: "paid", paidAt: "2026-04-05T12:00:00Z", voidedAt: null }, now)).toBe(false);
    expect(linkExpired({ status: "paid", paidAt: "2026-04-03T12:00:00Z", voidedAt: null }, now)).toBe(true);
    expect(linkExpired({ status: "void", paidAt: null, voidedAt: "2026-03-01T12:00:00Z" }, now)).toBe(true);
  });
});

describe("the business's list", () => {
  const rows = [
    row({ id: 1, referenceCode: "FP-0001", dueDate: "2026-09-20" }),
    row({ id: 2, referenceCode: "FP-0002", dueDate: "2026-09-25", status: "part_paid", paidCents: 10000, customerName: "TEST Other", customerPhone: "+12425559999", customerEmail: null }),
    row({ id: 3, referenceCode: "FP-0003", dueDate: "2026-10-30", customerSaysPaidAt: "2026-10-01T16:00:00Z" }),
    row({ id: 4, referenceCode: "FP-0004", status: "paid", paidCents: 42000, dueDate: "2026-09-01" }),
    row({ id: 5, referenceCode: "FP-0005", status: "void", dueDate: "2026-09-01" }),
  ];
  const today = "2026-10-01";

  it("filters outstanding, overdue, paid and to check, and searches by customer or reference", () => {
    expect(filterRequests(rows, "outstanding", "", today).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(filterRequests(rows, "overdue", "", today).map((r) => r.id)).toEqual([1, 2]);
    expect(filterRequests(rows, "paid", "", today).map((r) => r.id)).toEqual([4]);
    expect(filterRequests(rows, "check", "", today).map((r) => r.id)).toEqual([3]);
    expect(filterRequests(rows, "all", "fp-0003", today).map((r) => r.id)).toEqual([3]);
    expect(filterRequests(rows, "all", "other", today).map((r) => r.id)).toEqual([2]);
    expect(filterRequests(rows, "all", "555 9999", today).map((r) => r.id)).toEqual([2]);
  });

  it("chases overdue requests, oldest due date first", () => {
    expect(chaseList([...rows].reverse(), today).map((r) => r.referenceCode)).toEqual(["FP-0001", "FP-0002"]);
  });

  it("totals collected this Nassau month, outstanding and overdue", () => {
    const totals = requestTotals(rows, [
      { amountCents: 10000, status: "received", receivedAt: "2026-10-01T14:00:00Z" },
      { amountCents: 42000, status: "received", receivedAt: "2026-10-01T03:00:00Z" }, // 30 Sept in Nassau
      { amountCents: 5000, status: "refunded", receivedAt: "2026-10-01T14:00:00Z" },
    ], today);
    expect(totals.collectedThisMonthCents).toBe(10000);
    expect(totals.outstandingCents).toBe(42000 + 32000 + 42000);
    expect(totals.outstandingCount).toBe(3);
    expect(totals.overdueCents).toBe(42000 + 32000);
    expect(totals.overdueCount).toBe(2);
    expect(totals.toCheckCount).toBe(1);
    expect(nassauMonth("2026-10-01T03:00:00Z")).toBe("2026-09");
  });

  it("asks before a second reminder in the same day", () => {
    const now = new Date("2026-10-01T18:00:00Z");
    expect(remindedRecently(null, now)).toBe(false);
    expect(remindedRecently("2026-10-01T09:00:00Z", now)).toBe(true);
    expect(remindedRecently("2026-09-30T17:00:00Z", now)).toBe(false);
  });
});

describe("messages a person sends", () => {
  const input = { businessName: "TEST Futprep", customerName: "TEST Parent Smith", referenceCode: "FP-0042", lines: row().lines, totalCents: 42000, balanceCents: 42000, dueDate: "2026-10-09", payUrl: "https://portpassbahamas.com/pay/abc" };

  it("prefills WhatsApp with the amount, what it's for and the link", () => {
    const text = requestMessage(input, "2026-10-01");
    expect(text).toContain("$420.00");
    expect(text).toContain("Lil Kickers term fee — Amara");
    expect(text).toContain("FP-0042");
    expect(text).toContain("https://portpassbahamas.com/pay/abc");
    expect(text).toMatch(/^Hi TEST,/);
    const link = whatsappLink("+12425550100", text);
    expect(link.startsWith("https://wa.me/12425550100?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(text);
    expect(whatsappLink(null, "hi")).toBe("https://wa.me/?text=hi");
  });

  it("reminds and thanks without saying anything about cards", () => {
    const all = [requestMessage(input), reminderMessage(input), receiptMessage({ businessName: "TEST Futprep", customerName: "TEST Parent", referenceCode: "FP-0042", amountCents: 42000, balanceCents: 0, receiptUrl: "https://x/receipt" })].join("\n");
    expect(all).not.toMatch(/card|pay now/i);
    expect(reminderMessage(input)).toContain("I've paid");
  });

  it("summarises lines", () => {
    expect(linesSummary([{ label: "Jersey (M)", qty: 2, unitCents: 6500 }, { label: "Cap", qty: 1, unitCents: 2500 }])).toBe("2 × Jersey (M) and 1 more");
  });
});

describe("Futprep: request payment from a registration", () => {
  it("is the child's fee less what's already recorded, with only the first name and programme", () => {
    const line = futprepFeeLine({ programName: "Lil Kickers", childName: "Amara Jane Smith", paymentFrequency: "term", amountDueCents: 42000, paidCents: 10000 });
    expect(line).toEqual({ label: "Lil Kickers term fee (balance) — Amara", qty: 1, unitCents: 32000 });
    expect(futprepFeeLine({ programName: "Lil Kickers", childName: "Amara", paymentFrequency: "term", amountDueCents: 42000, paidCents: 0 })?.label).toBe("Lil Kickers term fee — Amara");
    expect(futprepFeeLine({ programName: "Lil Kickers", childName: "Amara", paymentFrequency: "term", amountDueCents: 42000, paidCents: 42000 })).toBeNull();
  });
});

describe("methods", () => {
  it("keeps card and kanoo_link reserved for Phase 2: listed, disabled, never offered", () => {
    expect(METHOD_LIST.filter((m) => !m.enabled).map((m) => m.value)).toEqual(["card", "kanoo_link"]);
    expect(REQUEST_METHODS).toEqual(["bank_transfer", "cash", "kanoo_wallet_manual"]);
    expect(REQUEST_METHODS as string[]).not.toContain("card");
  });

  const blank = { bankName: "", accountName: "", accountNumberLast4: null, transferInstructions: "", kanooHandleOrPhone: "", cashNote: "" };
  const bank = { ...blank, bankName: "TEST Bank", accountName: "TEST Kickers", accountNumberLast4: "0042" };

  it("offers only the methods the business chose, each with its details in place", () => {
    // Nothing until the business has said how it gets paid.
    expect(methodsSetUp(null)).toEqual([]);
    expect(methodsSetUp(blank)).toEqual([]);
    expect(methodsSetUp({ ...blank, acceptedMethods: ["cash"] })).toEqual(["cash"]);
    // Bank details given but bank transfer not chosen: not offered.
    expect(methodsSetUp({ ...bank, acceptedMethods: ["cash"] })).toEqual(["cash"]);
    expect(methodsSetUp({ ...bank, acceptedMethods: ["cash", "bank_transfer"] })).toEqual(["bank_transfer", "cash"]);
    // Chosen but its details are missing: not offered.
    expect(methodsSetUp({ ...blank, acceptedMethods: ["cash", "bank_transfer", "kanoo_wallet_manual"] })).toEqual(["cash"]);
    expect(methodsSetUp({ ...blank, kanooHandleOrPhone: "242 555 0100", acceptedMethods: ["kanoo_wallet_manual"] })).toEqual(["kanoo_wallet_manual"]);
  });

  it("says in words why a business can't send a request yet", () => {
    expect(getPaidProblem(null)).toBe("Add how you get paid first.");
    expect(getPaidProblem({ ...blank, acceptedMethods: [] })).toBe("Add how you get paid first.");
    expect(getPaidProblem({ ...blank, acceptedMethods: ["cash"] })).toBeNull();
    expect(getPaidProblem({ ...blank, acceptedMethods: ["bank_transfer"] })).toMatch(/bank and the account name/);
    expect(getPaidProblem({ ...blank, bankName: "TEST Bank", accountName: "TEST", acceptedMethods: ["bank_transfer"] })).toMatch(/last four digits/);
    // The last four digits, or the business's own instructions: either will do.
    expect(getPaidProblem({ ...bank, acceptedMethods: ["bank_transfer"] })).toBeNull();
    expect(getPaidProblem({ ...blank, bankName: "TEST Bank", accountName: "TEST", transferInstructions: "TEST transit 00000", acceptedMethods: ["bank_transfer"] })).toBeNull();
    expect(getPaidProblem({ ...blank, acceptedMethods: ["kanoo_wallet_manual"] })).toMatch(/Kanoo handle/);
  });

  it("leaves a TEST request out of every total and off the chase list", () => {
    const base = { id: 1, referenceCode: "TKA-0001", customerName: "TEST", customerEmail: null, customerPhone: null, lines: [], createdAt: "2026-10-01T12:00:00Z", sentAt: "2026-10-01T12:00:00Z", customerSaysPaidAt: null, lastRemindedAt: null, status: "sent" as const, totalCents: 100, paidCents: 0, dueDate: "2026-10-02" };
    const totals = requestTotals([{ ...base, isTest: true }, { ...base, id: 2, totalCents: 5000 }], [], "2026-10-10");
    expect(totals).toMatchObject({ outstandingCents: 5000, outstandingCount: 1, overdueCents: 5000, overdueCount: 1 });
    expect(chaseList([{ ...base, isTest: true }, { ...base, id: 2 }], "2026-10-10").map((r) => r.id)).toEqual([2]);
  });
});

describe("who handles payments", () => {
  it("owners and admins always, staff only with the permission, viewers never", () => {
    expect(memberHandlesPayments({ role: "org_owner", canManagePayments: false })).toBe(true);
    expect(memberHandlesPayments({ role: "org_admin", canManagePayments: false })).toBe(true);
    expect(memberHandlesPayments({ role: "org_staff", canManagePayments: false })).toBe(false);
    expect(memberHandlesPayments({ role: "org_staff", canManagePayments: true })).toBe(true);
    expect(memberHandlesPayments({ role: "org_viewer", canManagePayments: true })).toBe(false);
  });
});

describe("reference letters", () => {
  it("guesses initials, or two letters of a one-word name", () => {
    expect(defaultPrefix("Futprep Athletics")).toBe("FA");
    expect(defaultPrefix("Carv")).toBe("CA");
    expect(defaultPrefix("Bahamas Weddings By The Sea")).toBe("BWBT");
    expect(defaultPrefix("Café Matisse")).toBe("CM");
  });
});

describe("Admin -> Payments volume", () => {
  it("groups by month and business: sent and requested by send month, paid by received month", () => {
    const rows = paymentVolume(
      [
        { organizationId: 1, sentAt: "2026-10-01T15:00:00Z", totalCents: 42000, paidCents: 10000, status: "part_paid" },
        { organizationId: 1, sentAt: "2026-09-29T15:00:00Z", totalCents: 5000, paidCents: 5000, status: "paid" },
        { organizationId: 2, sentAt: "2026-10-01T15:00:00Z", totalCents: 9000, paidCents: 0, status: "sent" },
        { organizationId: 2, sentAt: null, totalCents: 9999, paidCents: 0, status: "draft" },
        { organizationId: 2, sentAt: "2026-10-01T15:00:00Z", totalCents: 7777, paidCents: 0, status: "void" },
      ],
      [
        { organizationId: 1, receivedAt: "2026-10-01T16:00:00Z", amountCents: 10000, viaRequest: true },
        { organizationId: 1, receivedAt: "2026-10-01T02:00:00Z", amountCents: 5000, viaRequest: true },
        { organizationId: 1, receivedAt: "2026-10-01T16:00:00Z", amountCents: 20000, viaRequest: false },
      ],
    );
    const find = (month: string, org: number) => rows.find((r) => r.month === month && r.organizationId === org);
    expect(find("2026-10", 1)).toMatchObject({ requestsSent: 1, requestedCents: 42000, recordedPaidCents: 10000, outstandingCents: 32000, otherRecordedCents: 20000 });
    expect(find("2026-09", 1)).toMatchObject({ requestsSent: 1, requestedCents: 5000, recordedPaidCents: 5000, outstandingCents: 0 });
    expect(find("2026-10", 2)).toMatchObject({ requestsSent: 1, requestedCents: 9000, outstandingCents: 9000 });
    expect(rows[0].month).toBe("2026-10");
  });
});

describe("export for the accountant", () => {
  it("writes requests and payments as CSV, with a BOM, and never lets a cell start a formula", () => {
    const csv = buildRequestsCsv([{ ...row({ customerName: "=HYPERLINK(1)" }), sentVia: "whatsapp_link", voidedReason: null, createdByName: "TEST Staff" } as ExportRequest]);
    expect(csv.startsWith("﻿\"Reference\"")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(1)\"");
    expect(csv).toContain("\"420.00\"");
    expect(csv).toContain("\"WhatsApp\"");
    const payments = buildPaymentsCsv([{ receiptNumber: "FP-R0001", receivedAt: "2026-10-01T15:00:00Z", referenceCode: "FP-0001", customerName: "TEST", method: "kanoo_wallet_manual", amountCents: 1000, transferReference: "T1", recordedBy: "TEST Staff", status: "received", refundNote: null }]);
    expect(payments).toContain("\"FP-R0001\",\"2026-10-01\",\"FP-0001\",\"TEST\",\"Kanoo wallet\",\"10.00\"");
  });
});
