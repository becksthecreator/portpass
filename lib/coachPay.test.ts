import { describe, expect, it } from "vitest";
import { clockMinutes, contractInvoiceCents, contractsCsv, estimateFieldCostCents, fieldCostFor, leftForFutprep, monthLabel, payCsv, payForRole, portpassFeeCents, sessionMinutes, shareFee, summarizePay, type LedgerRow } from "./coachPay";

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
    expect(leftForFutprep({ programId: 2, programName: "Kickers", termName: "Term 1", kind: "term", feesCollectedCents: 462000, coachPayCents: 60000, fieldCostCents: 0, portpassFeeCents: 3360 })).toBe(398640);
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
