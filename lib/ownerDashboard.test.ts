import { describe, expect, it } from "vitest";
import { PROTECTED_CHILD_COLUMNS } from "./health";
import {
  buildAttendanceCsv,
  buildMoneyCsv,
  childRates,
  countMarks,
  dashboardTiles,
  filterMoney,
  moneyMonths,
  moneyRows,
  nextSessionDay,
  privateSessionCounts,
  ratePercent,
  weekRange,
  type DashboardSession,
} from "./ownerDashboard";
import type { ListedRequest } from "./paymentRequests/rules";

// The owner's dashboard (brief 27, B), rule by rule. Today is a Wednesday
// in Nassau; a Saturday class sits three days ahead.
const today = "2026-10-14";

function request(over: Partial<ListedRequest & { paidAt: string | null }> = {}): ListedRequest & { paidAt: string | null } {
  return {
    id: 1,
    referenceCode: "TB-0001",
    customerName: "TEST Parent",
    customerEmail: "parent@example.com",
    customerPhone: "242-555-0101",
    lines: [{ label: "Term fee", qty: 1, unitCents: 30000 }],
    status: "sent",
    totalCents: 30000,
    paidCents: 0,
    dueDate: "2026-10-20",
    createdAt: "2026-10-01T15:00:00Z",
    sentAt: "2026-10-01T15:05:00Z",
    customerSaysPaidAt: null,
    lastRemindedAt: null,
    paidAt: null,
    ...over,
  };
}

const paid = request({ id: 2, referenceCode: "TB-0002", status: "paid", paidCents: 30000, paidAt: "2026-10-03T14:00:00Z" });
const overdue = request({ id: 3, referenceCode: "TB-0003", dueDate: "2026-10-10", totalCents: 4500, lines: [{ label: "Saturday session", qty: 1, unitCents: 4500 }] });
const pending = request({ id: 4, referenceCode: "TB-0004", totalCents: 7000, lines: [{ label: "Private session", qty: 2, unitCents: 3500 }] });
const draft = request({ id: 5, referenceCode: "TB-0005", status: "draft", sentAt: null });
const test = request({ id: 6, referenceCode: "TB-0006", status: "paid", paidCents: 30000, paidAt: "2026-10-05T14:00:00Z", isTest: true });
const lastMonth = request({ id: 7, referenceCode: "TB-0007", status: "paid", paidCents: 30000, paidAt: "2026-09-12T14:00:00Z", createdAt: "2026-09-01T15:00:00Z" });
const payments = [
  { requestId: 2, amountCents: 30000, status: "received" as const, receivedAt: "2026-10-03T14:00:00Z", method: "bank_transfer" },
  { requestId: 6, amountCents: 30000, status: "received" as const, receivedAt: "2026-10-05T14:00:00Z", method: "cash" },
  { requestId: 7, amountCents: 30000, status: "received" as const, receivedAt: "2026-09-12T14:00:00Z", method: "cash" },
];

describe("money rows", () => {
  const rows = moneyRows([paid, overdue, pending, draft, test, lastMonth], payments, today);

  it("one row per sent request, with the status a parent would recognise", () => {
    expect(rows.map((r) => [r.referenceCode, r.status])).toEqual([
      ["TB-0002", "paid"],
      ["TB-0007", "paid"],
      ["TB-0004", "pending"],
      ["TB-0003", "overdue"],
    ]);
  });

  it("leaves TEST requests and drafts out", () => {
    expect(rows.some((r) => r.referenceCode === "TB-0006" || r.referenceCode === "TB-0005")).toBe(false);
  });

  it("knows what it was for, how it was paid and when", () => {
    const row = rows.find((r) => r.referenceCode === "TB-0002")!;
    expect(row.what).toBe("Term fee");
    expect(row.method).toBe("Bank transfer");
    expect(row.paidAt).toBe("2026-10-03T14:00:00Z");
    expect(row.month).toBe("2026-10");
    expect(rows.find((r) => r.referenceCode === "TB-0004")!.what).toBe("2 × Private session");
    expect(rows.find((r) => r.referenceCode === "TB-0004")!.method).toBeNull();
  });

  it("filters by month and status", () => {
    expect(filterMoney(rows, "2026-09", "all").map((r) => r.referenceCode)).toEqual(["TB-0007"]);
    expect(filterMoney(rows, "2026-10", "overdue").map((r) => r.referenceCode)).toEqual(["TB-0003"]);
    expect(filterMoney(rows, null, "paid")).toHaveLength(2);
    expect(moneyMonths(rows, today)).toEqual(["2026-10", "2026-09"]);
    expect(moneyMonths([], "2026-11-02")).toEqual(["2026-11"]);
  });

  it("exports the same columns, and nothing about a child", () => {
    const csv = buildMoneyCsv(rows);
    expect(csv.split("\r\n")[0]).toBe('"Reference","Person","For","Amount","Balance","Status","Method","Date paid"');
    expect(csv).toContain('"TB-0003","TEST Parent","Saturday session","45.00","45.00","Overdue","",""');
    expect(csv).toContain('"TB-0002","TEST Parent","Term fee","300.00","0.00","Paid","Bank transfer","2026-10-03"');
  });
});

describe("attendance", () => {
  it("counts came, did not come and not marked", () => {
    expect(countMarks(5, ["present", "late", "absent", "excused"])).toEqual({ booked: 5, present: 2, absent: 2, notMarked: 1 });
    expect(countMarks(2, [])).toEqual({ booked: 2, present: 0, absent: 0, notMarked: 2 });
  });

  it("treats a private session as one booking that was completed, missed a mark, or is still to come", () => {
    expect(privateSessionCounts({ status: "completed", date: "2026-10-12", children: 1 }, today)).toEqual({ booked: 1, present: 1, absent: 0, notMarked: 0 });
    expect(privateSessionCounts({ status: "accepted", date: "2026-10-12", children: 2 }, today)).toEqual({ booked: 2, present: 0, absent: 0, notMarked: 2 });
    expect(privateSessionCounts({ status: "accepted", date: "2026-10-16", children: 1 }, today)).toEqual({ booked: 1, present: 0, absent: 0, notMarked: 0 });
  });

  it("rates each child on the sessions held so far", () => {
    const names = new Map([[1, "Lil Kickers"]]);
    const children = [
      { registrationId: 10, name: "A", programId: 1, termId: 1 },
      { registrationId: 11, name: "B", programId: 1, termId: 1 },
    ];
    const sessions = [{ programId: 1, termId: 1, date: "2026-10-03" }, { programId: 1, termId: 1, date: "2026-10-10" }, { programId: 1, termId: 1, date: "2026-10-17" }];
    const marks = [
      { registrationId: 10, status: "present" as const },
      { registrationId: 10, status: "late" as const },
      { registrationId: 11, status: "absent" as const },
    ];
    const rates = childRates(children, sessions, marks, names, today);
    expect(rates.map((r) => [r.name, r.held, r.present, ratePercent(r.rate)])).toEqual([["A", 2, 2, "100%"], ["B", 2, 0, "0%"]]);
    expect(childRates(children, [], marks, names, today)[0].rate).toBeNull();
    expect(ratePercent(null)).toBe("—");
  });

  it("the CSV names no protected column and has no health words", () => {
    const sessions: DashboardSession[] = [{ id: 1, kind: "class", name: "Lil Kickers", date: "2026-10-10", startTime: "9:00 AM", location: "Lyford Cay", booked: 6, present: 4, absent: 1, notMarked: 1 }];
    const csv = buildAttendanceCsv(sessions, [{ registrationId: 10, name: "A", programName: "Lil Kickers", held: 2, present: 2, rate: 1 }]);
    expect(csv).toContain('"2026-10-10","Lil Kickers","9:00 AM","Lyford Cay","6","4","1","1"');
    expect(csv).toContain('"A","Lil Kickers","2","2","100%"');
    for (const column of PROTECTED_CHILD_COLUMNS) expect(csv.toLowerCase()).not.toContain(column.replace(/_/g, " "));
    for (const word of ["allerg", "medic", "emergency", "pickup", "pick-up"]) expect(csv.toLowerCase()).not.toContain(word);
  });
});

describe("the four tiles", () => {
  const sessions = [
    { kind: "class" as const, date: "2026-10-10", booked: 6 },
    { kind: "class" as const, date: "2026-10-17", booked: 6 },
    { kind: "class" as const, date: "2026-10-17", booked: 9 },
    { kind: "private" as const, date: "2026-10-15", booked: 1 },
  ];

  it("this week runs Monday to Sunday in Nassau", () => {
    expect(weekRange(today)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(weekRange("2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(weekRange("2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("the next session day is the coming Saturday, with both classes counted", () => {
    expect(nextSessionDay(sessions, today)).toEqual({ date: "2026-10-17", booked: 15, sessions: 2 });
    expect(nextSessionDay(sessions, "2026-10-17")).toEqual({ date: "2026-10-17", booked: 15, sessions: 2 });
    expect(nextSessionDay(sessions, "2026-10-18")).toBeNull();
  });

  it("adds up collected this month, still owed, and this week's private sessions", () => {
    const tiles = dashboardTiles({
      requests: [paid, overdue, pending, draft, test, lastMonth],
      payments,
      sessions,
      privateRequests: [
        { date: "2026-10-15", status: "accepted" },
        { date: "2026-10-16", status: "pending" },
        { date: "2026-10-16", status: "declined" },
        { date: "2026-10-22", status: "accepted" },
      ],
      today,
    });
    // The TEST request's $300 is not money; last month's is not this month.
    expect(tiles.collectedThisMonthCents).toBe(30000);
    expect(tiles.owedCents).toBe(11500);
    expect(tiles.owedCount).toBe(2);
    expect(tiles.nextSessionDay?.date).toBe("2026-10-17");
    expect(tiles.privateThisWeek).toEqual({ accepted: 1, pending: 1 });
  });
});
