import { csvCell } from "@/lib/rosterCsv";
import { balanceCents, isOverdue, methodLabel, nassauDate, nassauMonth, requestTotals, type ListedRequest, type RecordedPayment } from "@/lib/paymentRequests/rules";

// The owner's dashboard (brief 27, B): money and attendance on one screen,
// worked out here from rows the database layer hands over. Nothing in this
// file reads the database, so every rule is unit-tested in
// lib/ownerDashboard.test.ts.
//
// Money is payment requests (brief 17): collected is what was marked paid,
// owed is what sent requests still have to bring in. PortPass never holds
// any of it. Attendance is names and marks only: no health, allergy,
// medication, emergency or pickup field has a place in these types, so none
// can reach the screen or the CSV.

// ---- money ---------------------------------------------------------------------------

export type DashboardPayment = RecordedPayment & { requestId: number; method: string };

export type MoneyStatus = "paid" | "pending" | "overdue" | "void";

export type MoneyRow = {
  id: number;
  referenceCode: string;
  person: string;
  what: string;
  amountCents: number;
  balanceCents: number;
  status: MoneyStatus;
  // The last payment's method, when any money has come in.
  method: string | null;
  paidAt: string | null;
  // The Nassau month the row belongs to: paid month when paid, else created.
  month: string;
};

export const MONEY_STATUS_LABEL: Record<MoneyStatus, string> = { paid: "Paid", pending: "Pending", overdue: "Overdue", void: "Void" };

function moneyStatus(r: ListedRequest, today: string): MoneyStatus {
  if (r.status === "void") return "void";
  if (r.status === "paid") return "paid";
  return isOverdue(r, today) ? "overdue" : "pending";
}

// One row per request, TEST requests left out. Drafts (never sent) are
// not money anyone owes yet, so they are left out too.
export function moneyRows(requests: (ListedRequest & { paidAt: string | null })[], payments: DashboardPayment[], today: string): MoneyRow[] {
  const lastPayment = new Map<number, DashboardPayment>();
  for (const p of payments) {
    if (p.status !== "received") continue;
    const current = lastPayment.get(p.requestId);
    if (!current || p.receivedAt > current.receivedAt) lastPayment.set(p.requestId, p);
  }
  return requests
    .filter((r) => !r.isTest && r.status !== "draft")
    .map((r) => {
      const status = moneyStatus(r, today);
      const last = lastPayment.get(r.id) ?? null;
      const paidAt = status === "paid" ? r.paidAt ?? last?.receivedAt ?? null : null;
      return {
        id: r.id,
        referenceCode: r.referenceCode,
        person: r.customerName,
        what: r.lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.label}` : l.label)).join(", "),
        amountCents: r.totalCents,
        balanceCents: balanceCents(r),
        status,
        method: last ? methodLabel(last.method) : null,
        paidAt,
        month: nassauMonth(paidAt ?? r.createdAt),
      };
    })
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "") || b.id - a.id);
}

export type MoneyFilter = "all" | MoneyStatus;

export function isMoneyFilter(value: unknown): value is MoneyFilter {
  return value === "all" || value === "paid" || value === "pending" || value === "overdue" || value === "void";
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function filterMoney(rows: MoneyRow[], month: string | null, status: MoneyFilter): MoneyRow[] {
  return rows.filter((r) => (month === null || r.month === month) && (status === "all" || r.status === status));
}

// The months the filter offers: every month with a row, newest first, with
// this month always present so the default view is never an empty choice.
export function moneyMonths(rows: MoneyRow[], today: string): string[] {
  return [...new Set([today.slice(0, 7), ...rows.map((r) => r.month)])].sort((a, b) => b.localeCompare(a));
}

export function buildMoneyCsv(rows: MoneyRow[]): string {
  const header = ["Reference", "Person", "For", "Amount", "Balance", "Status", "Method", "Date paid"];
  const out = [header.map(csvCell).join(",")];
  for (const r of rows) {
    out.push([r.referenceCode, r.person, r.what, (r.amountCents / 100).toFixed(2), (r.balanceCents / 100).toFixed(2), MONEY_STATUS_LABEL[r.status], r.method ?? "", r.paidAt ? nassauDate(r.paidAt) : ""].map(csvCell).join(","));
  }
  return `﻿${out.join("\r\n")}\r\n`;
}

// ---- attendance ----------------------------------------------------------------------

export type MarkStatus = "present" | "late" | "absent" | "excused";

export type DashboardSession = {
  id: number;
  kind: "class" | "private";
  name: string;
  date: string;
  startTime: string;
  location: string;
  booked: number;
  present: number;
  absent: number;
  notMarked: number;
};

// Present and late both count as came; absent and excused as did not.
export function countMarks(booked: number, marks: MarkStatus[]): Pick<DashboardSession, "booked" | "present" | "absent" | "notMarked"> {
  const present = marks.filter((m) => m === "present" || m === "late").length;
  const absent = marks.filter((m) => m === "absent" || m === "excused").length;
  return { booked, present, absent, notMarked: Math.max(0, booked - present - absent) };
}

// A private session is one booking: completed means they came; an accepted
// session whose day has passed without being completed is not marked yet;
// a future one is simply booked.
export function privateSessionCounts(input: { status: string; date: string; children: number }, today: string): Pick<DashboardSession, "booked" | "present" | "absent" | "notMarked"> {
  const booked = Math.max(1, input.children);
  if (input.status === "completed") return { booked, present: booked, absent: 0, notMarked: 0 };
  if (input.date < today) return { booked, present: 0, absent: 0, notMarked: booked };
  return { booked, present: 0, absent: 0, notMarked: 0 };
}

export type ChildRate = { registrationId: number; name: string; programName: string; held: number; present: number; rate: number | null };

// Per child, for the sessions of their class that have already happened in
// the period: came / held. Null until a session has been held.
export function childRates(
  children: { registrationId: number; name: string; programId: number; termId: number }[],
  sessions: { programId: number; termId: number; date: string }[],
  marks: { registrationId: number; status: MarkStatus }[],
  programNames: Map<number, string>,
  today: string,
): ChildRate[] {
  const heldByClass = new Map<string, number>();
  for (const s of sessions) {
    if (s.date > today) continue;
    const key = `${s.programId}:${s.termId}`;
    heldByClass.set(key, (heldByClass.get(key) ?? 0) + 1);
  }
  const presentByChild = new Map<number, number>();
  for (const m of marks) {
    if (m.status === "present" || m.status === "late") presentByChild.set(m.registrationId, (presentByChild.get(m.registrationId) ?? 0) + 1);
  }
  return children
    .map((c) => {
      const held = heldByClass.get(`${c.programId}:${c.termId}`) ?? 0;
      const present = Math.min(held, presentByChild.get(c.registrationId) ?? 0);
      return { registrationId: c.registrationId, name: c.name, programName: programNames.get(c.programId) ?? "", held, present, rate: held > 0 ? present / held : null };
    })
    .sort((a, b) => a.programName.localeCompare(b.programName) || a.name.localeCompare(b.name));
}

export function ratePercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function buildAttendanceCsv(sessions: DashboardSession[], rates: ChildRate[]): string {
  const header = ["Date", "Session", "Time", "Place", "Booked", "Present", "Absent", "Not marked"];
  const out = [header.map(csvCell).join(",")];
  for (const s of sessions) {
    out.push([s.date, s.kind === "private" ? `Private · ${s.name}` : s.name, s.startTime, s.location, String(s.booked), String(s.present), String(s.absent), String(s.notMarked)].map(csvCell).join(","));
  }
  out.push("");
  out.push(["Child", "Class", "Sessions held", "Came", "Rate"].map(csvCell).join(","));
  for (const r of rates) out.push([r.name, r.programName, String(r.held), String(r.present), ratePercent(r.rate)].map(csvCell).join(","));
  return `﻿${out.join("\r\n")}\r\n`;
}

// ---- the four tiles ------------------------------------------------------------------

export type Tiles = {
  collectedThisMonthCents: number;
  owedCents: number;
  owedCount: number;
  // The next day with a class session (today if there is one today).
  nextSessionDay: { date: string; booked: number; sessions: number } | null;
  privateThisWeek: { accepted: number; pending: number };
};

// Monday to Sunday, Nassau calendar days.
export function weekRange(today: string): { from: string; to: string } {
  const d = new Date(`${today}T12:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - weekday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export function nextSessionDay(sessions: Pick<DashboardSession, "kind" | "date" | "booked">[], today: string): Tiles["nextSessionDay"] {
  const upcoming = sessions.filter((s) => s.kind === "class" && s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) return null;
  const date = upcoming[0].date;
  const day = upcoming.filter((s) => s.date === date);
  return { date, booked: day.reduce((sum, s) => sum + s.booked, 0), sessions: day.length };
}

export function dashboardTiles(input: {
  requests: ListedRequest[];
  payments: DashboardPayment[];
  sessions: Pick<DashboardSession, "kind" | "date" | "booked">[];
  privateRequests: { date: string; status: string }[];
  today: string;
}): Tiles {
  // Money recorded against a TEST request is not money (brief 18, E3).
  const testIds = new Set(input.requests.filter((r) => r.isTest).map((r) => r.id));
  const totals = requestTotals(input.requests, input.payments.filter((p) => !testIds.has(p.requestId)), input.today);
  const week = weekRange(input.today);
  const thisWeek = input.privateRequests.filter((r) => r.date >= week.from && r.date <= week.to);
  return {
    collectedThisMonthCents: totals.collectedThisMonthCents,
    owedCents: totals.outstandingCents,
    owedCount: totals.outstandingCount,
    nextSessionDay: nextSessionDay(input.sessions, input.today),
    privateThisWeek: { accepted: thisWeek.filter((r) => r.status === "accepted").length, pending: thisWeek.filter((r) => r.status === "pending").length },
  };
}
