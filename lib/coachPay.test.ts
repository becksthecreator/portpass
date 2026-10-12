import { describe, expect, it } from "vitest";
import { clockMinutes, privateLineName, privatePayFor, contractInvoiceCents, contractsCsv, estimateFieldCostCents, fieldCostFor, leftForFutprep, monthLabel, payCsv, payForRole, portpassFeeCents, sessionMinutes, shareFee, summarizePay, type LedgerRow } from "./coachPay";

const BEX = { defaultLeadPayCents: 5000, defaultAssistantPayCents: null };

describe("coach pay (brief 13)", () => {
  it("pays Coach Bex $50 as lead and nothing set yet as an assistant", () => {
    expect(payForRole(BEX, "lead")).toBe(5000);
    expect(payForRole(BEX, "assistant")).toBeNull();
  });

  it("totals sessions, owed and paid per coach per month", () => {
    const rows: LedgerRow[] = [
      { coachId: 3, coachName: "Coach Bex", sessionDate: "2026-10-03", programName: "Lil Kickers", role: "lead", payCents: 5000, paidAt: "2026-10-05T12:00:00Z" },
      { coachId: 3, coachName: "Coach Bex", sessionDate: "2026-10-03", programName: "Kickers", role: "lead", payCents: 5000, paidAt: null },
      { coachId: 3, coachName: "Coach Bex", sessionDate: "2026-09-26", programName: "Kickers", role: "lead", payCents: 5000, paidAt: null },
      { coachId: 13, coachName: "Coach Dre", sessionDate: "2026-10-03", programName: "Kickers", role: "assistant", payCents: 2500, paidAt: null },
    ];
    expect(summarizePay(rows)).toEqual([
      { coachId: 3, coachName: "Coach Bex", month: "2026-10", sessions: 2, owedCents: 5000, paidCents: 5000 },
      { coachId: 13, coachName: "Coach Dre", month: "2026-10", sessions: 1, owedCents: 2500, paidCents: 0 },
      { coachId: 3, coachName: "Coach Bex", month: "2026-09", sessions: 1, owedCents: 5000, paidCents: 0 },
    ]);
    expect(monthLabel("2026-10")).toBe("October 2026");
    const csv = payCsv(rows);
    expect(csv.split("\r\n")[0]).toBe('"Coach","Month","Session date","Program","Role","Pay (BSD)","Paid on"');
    expect(csv).toContain('"Coach Bex","2026-10","2026-10-03","Lil Kickers","lead","50.00","2026-10-05"');
  });
});

describe("the PortPass fee (Money Model: Founding Partner)", () => {
  it("is 8% of fees from families PortPass brought, never more than $360 a term", () => {
    expect(portpassFeeCents(0)).toBe(0);
    expect(portpassFeeCents(42000)).toBe(3360); // one $420 Kickers family
    expect(portpassFeeCents(10 * 42000)).toBe(33600);
    expect(portpassFeeCents(20 * 42000)).toBe(36000); // capped
  });

  it("shares one term's fee across its classes in proportion, to the cent", () => {
    expect(shareFee(36000, [30000, 42000])).toEqual([15000, 21000]);
    expect(shareFee(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(shareFee(500, [0, 0])).toEqual([0, 0]);
  });

  it("leaves what's left for Futprep", () => {
    expect(leftForFutprep({ feesCollectedCents: 462000, coachPayCents: 60000, fieldCostCents: 0, portpassFeeCents: 3360 })).toBe(398640);
  });
});

describe("school contracts (brief 13)", () => {
  it("invoices sessions delivered × fee, or the term fee", () => {
    expect(contractInvoiceCents("per_session", 15000, 6)).toBe(90000);
    expect(contractInvoiceCents("per_term", 120000, 6)).toBe(120000);
    expect(contractInvoiceCents("per_term", 120000, 0)).toBe(0);
  });

  it("exports an invoice CSV with no child data", () => {
    const csv = contractsCsv([{ client: "St Andrew's School", programName: "St Andrew's coaching", termName: "Fall 2026", billing: "per_session", feeCents: 15000, sessionsDelivered: 6, sessionsScheduled: 12, invoiceCents: 90000 }]);
    expect(csv).toBe(
      '"Client","Program","Term","Billing","Fee (BSD)","Sessions delivered","Sessions scheduled","To invoice (BSD)"\r\n' +
        '"St Andrew\'s School","St Andrew\'s coaching","Fall 2026","Per session","150.00","6","12","900.00"\r\n',
    );
  });
});

describe("field cost from the location (brief 31, B3)", () => {
  it("reads the clock times programs are stored with", () => {
    expect(clockMinutes("10:00 AM")).toBe(600);
    expect(clockMinutes("12:15 PM")).toBe(735);
    expect(clockMinutes("12:00 AM")).toBe(0);
    expect(clockMinutes("6:30pm")).toBe(1110);
    expect(clockMinutes("18:30")).toBe(1110);
    expect(clockMinutes("13:00 PM")).toBeNull();
    expect(clockMinutes("")).toBeNull();
    expect(clockMinutes(null)).toBeNull();
    expect(sessionMinutes("10:00 AM", "10:45 AM")).toBe(45);
    expect(sessionMinutes("10:45 AM", "10:00 AM")).toBeNull();
    expect(sessionMinutes("10:00 AM", null)).toBeNull();
  });

  it("works out a term from what the place charges", () => {
    expect(estimateFieldCostCents({ costModel: "per_hour", costCents: 4000 }, 12, 45)).toBe(36000);
    expect(estimateFieldCostCents({ costModel: "per_session", costCents: 2500 }, 10, null)).toBe(25000);
    expect(estimateFieldCostCents({ costModel: "per_term", costCents: 80000 }, 10, 60)).toBe(80000);
    // Four programs at one place paid by the term share it: counted once.
    expect(estimateFieldCostCents({ costModel: "per_term", costCents: 80000 }, 10, 60, 4)).toBe(20000);
    expect(estimateFieldCostCents({ costModel: "per_term", costCents: 10000 }, 10, 60, 3)).toBe(3333);
    expect(estimateFieldCostCents({ costModel: "free", costCents: null }, 10, 60)).toBe(0);
    expect(estimateFieldCostCents({ costModel: "school_pays", costCents: 5000 }, 10, 60)).toBe(0);
  });

  it("says nothing rather than guess", () => {
    expect(estimateFieldCostCents(null, 10, 60)).toBeNull();
    expect(estimateFieldCostCents({ costModel: null, costCents: 4000 }, 10, 60)).toBeNull();
    expect(estimateFieldCostCents({ costModel: "per_hour", costCents: null }, 10, 60)).toBeNull();
    expect(estimateFieldCostCents({ costModel: "per_hour", costCents: 4000 }, 10, null)).toBeNull();
  });

  it("what Alex typed for the program wins over the estimate", () => {
    expect(fieldCostFor(30000, 36000)).toEqual({ cents: 30000, source: "stored" });
    expect(fieldCostFor(0, 36000)).toEqual({ cents: 0, source: "stored" });
    expect(fieldCostFor(null, 36000)).toEqual({ cents: 36000, source: "estimated" });
    expect(fieldCostFor(null, null)).toEqual({ cents: 0, source: "none" });
  });
});

describe("private session pay (brief 31, C5 and C6)", () => {
  const rates = { private30PayCents: 2000, private60PayCents: 3500 };

  it("takes the coach's own rate for 30 and 60 minutes", () => {
    expect(privatePayFor(rates, 30)).toEqual({ cents: 2000, basis: "rate_30" });
    expect(privatePayFor(rates, 60)).toEqual({ cents: 3500, basis: "rate_60" });
  });

  it("works out other lengths pro rata from the 60-minute rate, else the 30-minute one", () => {
    expect(privatePayFor(rates, 45)).toEqual({ cents: 2625, basis: "pro_rata_60" });
    expect(privatePayFor(rates, 90)).toEqual({ cents: 5250, basis: "pro_rata_60" });
    expect(privatePayFor({ private30PayCents: 2000, private60PayCents: null }, 60)).toEqual({ cents: 4000, basis: "pro_rata_30" });
    expect(privatePayFor({ private30PayCents: null, private60PayCents: 3500 }, 30)).toEqual({ cents: 1750, basis: "pro_rata_60" });
  });

  it("is $0, marked, until Futprep sets a rate", () => {
    expect(privatePayFor({ private30PayCents: null, private60PayCents: null }, 30)).toEqual({ cents: 0, basis: "not_set" });
  });

  it("adds private lines to the month's totals, and the CSV names the reference, never the child", () => {
    const rows: LedgerRow[] = [
      { coachId: 1, coachName: "TEST Coach", sessionDate: "2026-10-03", programName: "TEST Kickers", role: "lead", payCents: 5000, paidAt: null },
      { coachId: 1, coachName: "TEST Coach", sessionDate: "2026-10-07", programName: privateLineName("FP-S-0007"), role: "lead", payCents: 2000, paidAt: null, kind: "private" },
      { coachId: 1, coachName: "TEST Coach", sessionDate: "2026-10-09", programName: privateLineName("FP-S-0008"), role: "lead", payCents: 3500, paidAt: "2026-10-10T12:00:00Z", kind: "private" },
    ];
    expect(summarizePay(rows)).toEqual([{ coachId: 1, coachName: "TEST Coach", month: "2026-10", sessions: 3, owedCents: 7000, paidCents: 3500 }]);
    const csv = payCsv(rows);
    expect(csv).toContain("Private session · FP-S-0007");
    expect(csv).toContain(",private,20.00,");
  });
});
