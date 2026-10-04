import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// A business's attendance register (brief 18, part B): the sessions of its
// own classes and camps, who is registered for each, and who came. The
// same sessions and attendance tables Futprep's coaches mark, for any
// business. Every function takes the business's id and reads or changes
// only its rows.
//
// The register is names only: no contact, health, emergency or pickup
// detail is read for it.

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendanceSession = {
  id: number;
  programName: string;
  date: string;
  startTime: string;
  location: string;
  // How many are on the register, and how many have been marked.
  expected: number;
  marked: number;
};

export type AttendanceRow = { registrationId: number; participantName: string; status: AttendanceStatus | null };

type Row = Record<string, unknown>;
const ON_THE_REGISTER = ["pending_details", "pending", "confirmed"];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ownPrograms(organizationId: number): Promise<Map<number, string>> {
  const { data, error } = await getSupabaseAdmin().from("programs").select("id,name,program_type").eq("organization_id", organizationId);
  throwIfSupabaseError(error, "Could not load programmes");
  // A school contract's children are the school's: not on this register.
  return new Map(((data ?? []) as Row[]).filter((p) => p.program_type !== "contract").map((p) => [Number(p.id), String(p.name)]));
}

// The sessions worth marking: the last three weeks through the next week,
// newest first. `today` is the day in Nassau.
export async function listBusinessSessions(organizationId: number, today: string): Promise<AttendanceSession[]> {
  const db = getSupabaseAdmin();
  const programs = await ownPrograms(organizationId);
  if (programs.size === 0) return [];
  const { data: sessionRows, error } = await db
    .from("sessions")
    .select("id,program_id,term_id,session_date,start_time,location,status")
    .in("program_id", [...programs.keys()])
    .gte("session_date", addDays(today, -21))
    .lte("session_date", addDays(today, 7))
    .neq("status", "cancelled")
    .order("session_date", { ascending: false })
    .limit(200);
  throwIfSupabaseError(error, "Could not load sessions");
  const sessions = (sessionRows ?? []) as Row[];
  if (sessions.length === 0) return [];

  const termIds = [...new Set(sessions.map((s) => Number(s.term_id)))];
  const [{ data: registrations, error: registrationError }, { data: marks, error: markError }] = await Promise.all([
    db.from("registrations").select("id,program_id,term_id").eq("organization_id", organizationId).in("term_id", termIds).in("registration_status", ON_THE_REGISTER).limit(5000),
    db.from("attendance").select("session_id").in("session_id", sessions.map((s) => Number(s.id))).limit(10000),
  ]);
  throwIfSupabaseError(registrationError, "Could not load registrations");
  throwIfSupabaseError(markError, "Could not load attendance");
  const expected = new Map<string, number>();
  for (const r of (registrations ?? []) as Row[]) {
    const key = `${r.program_id}:${r.term_id}`;
    expected.set(key, (expected.get(key) ?? 0) + 1);
  }
  const marked = new Map<number, number>();
  for (const m of (marks ?? []) as Row[]) marked.set(Number(m.session_id), (marked.get(Number(m.session_id)) ?? 0) + 1);

  return sessions.map((s) => ({
    id: Number(s.id),
    programName: programs.get(Number(s.program_id)) ?? "",
    date: String(s.session_date),
    startTime: String(s.start_time ?? ""),
    location: String(s.location ?? ""),
    expected: expected.get(`${s.program_id}:${s.term_id}`) ?? 0,
    marked: marked.get(Number(s.id)) ?? 0,
  }));
}

// One session's register. null when the session isn't this business's.
export async function getBusinessSessionRoster(organizationId: number, sessionId: number): Promise<{ session: Omit<AttendanceSession, "expected" | "marked">; rows: AttendanceRow[] } | null> {
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from("sessions").select("id,program_id,term_id,session_date,start_time,location").eq("id", sessionId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the session");
  if (!session) return null;
  const programs = await ownPrograms(organizationId);
  const programName = programs.get(Number(session.program_id));
  if (programName === undefined) return null;

  const [{ data: registrations, error: registrationError }, { data: marks, error: markError }] = await Promise.all([
    // Names only: nothing about contact, health or pickup is selected.
    db.from("registrations").select("id,child_name").eq("organization_id", organizationId).eq("program_id", session.program_id).eq("term_id", session.term_id).in("registration_status", ON_THE_REGISTER).order("child_name", { ascending: true }).limit(500),
    db.from("attendance").select("registration_id,status").eq("session_id", sessionId).limit(1000),
  ]);
  throwIfSupabaseError(registrationError, "Could not load the register");
  throwIfSupabaseError(markError, "Could not load attendance");
  const status = new Map(((marks ?? []) as Row[]).map((m) => [Number(m.registration_id), String(m.status)]));
  return {
    session: { id: Number(session.id), programName, date: String(session.session_date), startTime: String(session.start_time ?? ""), location: String(session.location ?? "") },
    rows: ((registrations ?? []) as Row[]).map((r) => {
      const value = status.get(Number(r.id));
      return { registrationId: Number(r.id), participantName: String(r.child_name ?? ""), status: ATTENDANCE_STATUSES.find((s) => s === value) ?? null };
    }),
  };
}

// Mark one person for one session. Both must be this business's, and the
// person must be registered for that session's class and term.
export async function markBusinessAttendance(organizationId: number, input: { sessionId: number; registrationId: number; status: AttendanceStatus; markedBy: string }): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from("sessions").select("id,program_id,term_id").eq("id", input.sessionId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the session");
  if (!session) throw new Error("NOT_FOUND");
  const { data: registration, error: registrationError } = await db
    .from("registrations")
    .select("id")
    .eq("id", input.registrationId)
    .eq("organization_id", organizationId)
    .eq("program_id", session.program_id)
    .eq("term_id", session.term_id)
    .in("registration_status", ON_THE_REGISTER)
    .maybeSingle();
  throwIfSupabaseError(registrationError, "Could not load the registration");
  if (!registration) throw new Error("NOT_FOUND");
  // The registration is this business's and is for this session's
  // programme, so the session is this business's too.
  const { error: saveError } = await db
    .from("attendance")
    .upsert({ registration_id: input.registrationId, session_id: input.sessionId, status: input.status, marked_by: input.markedBy.slice(0, 80), marked_at: new Date().toISOString() }, { onConflict: "registration_id,session_id" });
  throwIfSupabaseError(saveError, "Could not save attendance");
}
