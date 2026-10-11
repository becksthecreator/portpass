import "server-only";
import {
  childRates,
  countMarks,
  dashboardTiles,
  moneyMonths,
  moneyRows,
  privateSessionCounts,
  type ChildRate,
  type DashboardSession,
  type MarkStatus,
  type MoneyRow,
  type Tiles,
} from "@/lib/ownerDashboard";
import { nassauToday } from "@/lib/futprepTerms";
import { listOrgRequestPayments, listPaymentRequests } from "./paymentRequests";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// What the owner's dashboard reads (brief 27, B), for one business, by its
// id. Money comes from the payment requests module as it stands (brief 17);
// attendance from the same sessions, registrations and attendance tables
// the register marks (brief 18, B); private sessions from brief 29's
// requests. Every query is scoped to the business's own rows.
//
// Names and marks only: the registration select names the child and the
// class, never a health, emergency or pickup column, so the dashboard and
// its CSV cannot carry one (lib/health.static.test.ts reads this file).

type Row = Record<string, unknown>;
const ON_THE_REGISTER = ["pending_details", "pending", "confirmed"];
// The period on the screen: the last eight weeks through next week.
const WEEKS_BACK = 8;
const DAYS_AHEAD = 7;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type OwnerDashboardData = {
  today: string;
  tiles: Tiles;
  // Null when the person may not see money (a coach without the payments
  // permission): the money queries are never run for them.
  money: { rows: MoneyRow[]; months: string[] } | null;
  sessions: DashboardSession[];
  rates: ChildRate[];
};

export async function loadMoneyRows(orgId: number, today: string = nassauToday()): Promise<MoneyRow[]> {
  const [requests, payments] = await Promise.all([listPaymentRequests(orgId), listOrgRequestPayments(orgId)]);
  return moneyRows(requests, payments.map((p) => ({ requestId: p.requestId, amountCents: p.amountCents, status: p.status, receivedAt: p.receivedAt, method: p.method })), today);
}

type AttendanceLoad = { sessions: DashboardSession[]; rates: ChildRate[]; privateRequests: { date: string; status: string }[] };

export async function loadAttendance(orgId: number, today: string = nassauToday()): Promise<AttendanceLoad> {
  const db = getSupabaseAdmin();
  const from = addDays(today, -WEEKS_BACK * 7);
  const to = addDays(today, DAYS_AHEAD);

  const { data: programRows, error: programError } = await db.from("programs").select("id,name,program_type").eq("organization_id", orgId);
  throwIfSupabaseError(programError, "Could not load programmes");
  // A school contract's children are the school's: not on this register.
  const programs = new Map(((programRows ?? []) as Row[]).filter((p) => p.program_type !== "contract").map((p) => [Number(p.id), String(p.name)]));

  const [{ data: sessionRows, error: sessionError }, { data: privateRows, error: privateError }, { data: coachRows, error: coachError }] = await Promise.all([
    programs.size > 0
      ? db.from("sessions").select("id,program_id,term_id,session_date,start_time,location").in("program_id", [...programs.keys()]).gte("session_date", from).lte("session_date", to).neq("status", "cancelled").order("session_date", { ascending: false }).limit(400)
      : Promise.resolve({ data: [] as Row[], error: null }),
    db
      .from("private_session_requests")
      .select("id,reference_code,child_name,requested_date,requested_start_time,location_preference,status,children_count,assigned_coach_id,preferred_coach_id")
      .eq("organization_id", orgId)
      .gte("requested_date", from)
      .lte("requested_date", to)
      .order("requested_date", { ascending: false })
      .limit(400),
    db.from("coach_profiles").select("id,display_name").eq("organization_id", orgId),
  ]);
  throwIfSupabaseError(sessionError, "Could not load sessions");
  throwIfSupabaseError(privateError, "Could not load private sessions");
  throwIfSupabaseError(coachError, "Could not load coaches");
  const sessions = (sessionRows ?? []) as Row[];
  const coachName = new Map(((coachRows ?? []) as Row[]).map((c) => [Number(c.id), String(c.display_name)]));

  const termIds = [...new Set(sessions.map((s) => Number(s.term_id)))];
  const [{ data: registrationRows, error: registrationError }, { data: markRows, error: markError }] = await Promise.all([
    termIds.length > 0
      ? db.from("registrations").select("id,child_name,program_id,term_id").eq("organization_id", orgId).in("term_id", termIds).in("registration_status", ON_THE_REGISTER).limit(5000)
      : Promise.resolve({ data: [] as Row[], error: null }),
    sessions.length > 0
      ? db.from("attendance").select("session_id,registration_id,status").in("session_id", sessions.map((s) => Number(s.id))).limit(20000)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  throwIfSupabaseError(registrationError, "Could not load registrations");
  throwIfSupabaseError(markError, "Could not load attendance");

  const children = ((registrationRows ?? []) as Row[]).map((r) => ({ registrationId: Number(r.id), name: String(r.child_name ?? ""), programId: Number(r.program_id), termId: Number(r.term_id) }));
  const bookedByClass = new Map<string, number>();
  for (const c of children) {
    const key = `${c.programId}:${c.termId}`;
    bookedByClass.set(key, (bookedByClass.get(key) ?? 0) + 1);
  }
  const marksBySession = new Map<number, MarkStatus[]>();
  const marks: { registrationId: number; status: MarkStatus }[] = [];
  for (const m of (markRows ?? []) as Row[]) {
    const status = String(m.status) as MarkStatus;
    marksBySession.set(Number(m.session_id), [...(marksBySession.get(Number(m.session_id)) ?? []), status]);
    marks.push({ registrationId: Number(m.registration_id), status });
  }

  const classSessions: DashboardSession[] = sessions.map((s) => ({
    id: Number(s.id),
    kind: "class",
    name: programs.get(Number(s.program_id)) ?? "",
    date: String(s.session_date),
    startTime: String(s.start_time ?? ""),
    location: String(s.location ?? ""),
    ...countMarks(bookedByClass.get(`${s.program_id}:${s.term_id}`) ?? 0, marksBySession.get(Number(s.id)) ?? []),
  }));

  const privates = (privateRows ?? []) as Row[];
  const privateSessions: DashboardSession[] = privates
    .filter((p) => p.status === "accepted" || p.status === "completed")
    .map((p) => {
      const coach = coachName.get(Number(p.assigned_coach_id ?? p.preferred_coach_id)) ?? "Coach to be confirmed";
      return {
        id: Number(p.id),
        kind: "private" as const,
        name: `${coach} · ${String(p.child_name ?? "")}`,
        date: String(p.requested_date),
        startTime: String(p.requested_start_time ?? ""),
        location: String(p.location_preference ?? ""),
        ...privateSessionCounts({ status: String(p.status), date: String(p.requested_date), children: Number(p.children_count ?? 1) }, today),
      };
    });

  const all = [...classSessions, ...privateSessions].sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
  const held = sessions.map((s) => ({ programId: Number(s.program_id), termId: Number(s.term_id), date: String(s.session_date) }));
  return {
    sessions: all,
    rates: childRates(children, held, marks, programs, today),
    privateRequests: privates.map((p) => ({ date: String(p.requested_date), status: String(p.status) })),
  };
}

export async function loadOwnerDashboard(orgId: number, options: { money: boolean; today?: string }): Promise<OwnerDashboardData> {
  const today = options.today ?? nassauToday();
  const [attendance, requests, payments] = await Promise.all([
    loadAttendance(orgId, today),
    options.money ? listPaymentRequests(orgId) : Promise.resolve([]),
    options.money ? listOrgRequestPayments(orgId) : Promise.resolve([]),
  ]);
  const dashboardPayments = payments.map((p) => ({ requestId: p.requestId, amountCents: p.amountCents, status: p.status, receivedAt: p.receivedAt, method: p.method }));
  const rows = options.money ? moneyRows(requests, dashboardPayments, today) : [];
  return {
    today,
    tiles: dashboardTiles({ requests, payments: dashboardPayments, sessions: attendance.sessions, privateRequests: attendance.privateRequests, today }),
    money: options.money ? { rows, months: moneyMonths(rows, today) } : null,
    sessions: attendance.sessions,
    rates: attendance.rates,
  };
}
