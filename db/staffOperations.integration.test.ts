import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nassauToday } from "@/lib/futprepTerms";
import { createFutprepProgram } from "./programs";
import { ensureFutprepPilotData } from "./registrations";
import {
  getFutprepSessionPlan,
  getFutprepWorkLog,
  listFutprepSessionPlans,
  listFutprepStaffSessions,
  listFutprepWorkLogs,
  saveFutprepSessionPlan,
  saveFutprepWorkLog,
} from "./staff";

// The coach's session tools (session_plans and staff_work_logs, made by
// 202609010002 and restored to the project's database by 202610190001),
// against the local Supabase stack CI starts: a plan is saved and read back
// on the coach screen, each coach's hours are saved per session and summed
// on the CEO overview, hours outside a day are refused, a session that is
// not Futprep's is refused, and a browser key sees neither table. Every row
// is TEST data on a TEST class and is removed afterwards.
const url = process.env.SUPABASE_URL!;
const db = () => createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const MARK = `TEST — delete ${crypto.randomUUID().slice(0, 6)}`;
const today = nassauToday();

function shift(days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let orgId = 0;
let classId = 0;
let sessionId = 0;
let sessionDate = "";
const locationName = `${MARK} field`;
const coach = `${MARK} Coach`;
const assistant = `${MARK} Assistant`;

beforeAll(async () => {
  await ensureFutprepPilotData();
  const { data: org } = await db().from("organizations").select("id").eq("slug", "futprep").single();
  orgId = Number(org!.id);
  const made = await createFutprepProgram({
    name: `${MARK} class`, ageMin: 3, ageMax: 6, coed: true, locationName, locationAddress: "TEST",
    dayOfWeek: "Saturday", startTime: "10:00 AM", endTime: "10:45 AM", capacity: 20,
    termName: "TEST Term", termStartDate: shift(-7), termEndDate: shift(35), breakDates: [],
    weeklyFeeCents: 4500, termFeeCents: 42000, registrationFeeCents: 0,
  });
  classId = made.id;
  const session = (await listFutprepStaffSessions()).find((item) => item.program_id === classId);
  expect(session, "the TEST class must have a session in the coaches' picker").toBeDefined();
  sessionId = session!.id;
  sessionDate = session!.session_date;
});

afterAll(async () => {
  // Deleting the program removes its sessions, and with them (on delete
  // cascade) the plan and the work logs this file saved.
  if (classId) {
    await db().from("registrations").delete().eq("program_id", classId);
    await db().from("programs").delete().eq("id", classId);
  }
  if (orgId) await db().from("locations").delete().eq("organization_id", orgId).eq("name", locationName);
});

describe("a session plan", () => {
  it("is saved once per session, read back on the coach screen and listed for the CEO", async () => {
    expect(await getFutprepSessionPlan(sessionId)).toBeNull();
    await saveFutprepSessionPlan({ sessionId, title: `${MARK} dribbling`, planText: "Cones, then a game.", parentNote: "Bring water.", attachmentUrl: "", updatedBy: coach });
    expect(await getFutprepSessionPlan(sessionId)).toMatchObject({ session_id: sessionId, title: `${MARK} dribbling`, plan_text: "Cones, then a game.", parent_note: "Bring water.", updated_by: coach });

    // Saving again replaces the plan; a session never has two.
    await saveFutprepSessionPlan({ sessionId, title: `${MARK} passing`, planText: "Pairs.", parentNote: "", attachmentUrl: "https://example.com/plan", updatedBy: assistant });
    const { data: rows } = await db().from("session_plans").select("title,attachment_url,updated_by").eq("session_id", sessionId);
    expect(rows).toEqual([{ title: `${MARK} passing`, attachment_url: "https://example.com/plan", updated_by: assistant }]);

    const listed = (await listFutprepSessionPlans()).filter((item) => item.session_id === sessionId);
    expect(listed.map((item) => item.title)).toEqual([`${MARK} passing`]);
  });
});

describe("a coach's hours", () => {
  it("are saved per session and coach, summed for the CEO, and refused outside a day", async () => {
    expect(await getFutprepWorkLog(sessionId, coach)).toBeNull();
    await saveFutprepWorkLog({ sessionId, staffName: coach, workDate: sessionDate, startTime: "09:30", endTime: "11:00", hours: 1.5, notes: "Set up early." });
    await saveFutprepWorkLog({ sessionId, staffName: assistant, workDate: sessionDate, startTime: "10:00", endTime: "12:00", hours: 2, notes: "" });
    expect(await getFutprepWorkLog(sessionId, coach)).toMatchObject({ session_id: sessionId, staff_name: coach, work_date: sessionDate, start_time: "09:30", end_time: "11:00", hours: 1.5, notes: "Set up early." });

    // The same coach saving again corrects the row rather than adding one.
    await saveFutprepWorkLog({ sessionId, staffName: coach, workDate: sessionDate, startTime: "09:45", endTime: "11:00", hours: 1.25, notes: "" });
    const mine = (await listFutprepWorkLogs()).filter((item) => item.session_id === sessionId);
    expect(mine.map((item) => [item.staff_name, item.hours]).sort()).toEqual([[assistant, 2], [coach, 1.25]].sort());
    expect(mine.reduce((sum, item) => sum + item.hours, 0)).toBe(3.25);

    await expect(saveFutprepWorkLog({ sessionId, staffName: coach, workDate: sessionDate, startTime: "", endTime: "", hours: 25, notes: "" })).rejects.toThrow("INVALID_HOURS");
    await expect(saveFutprepWorkLog({ sessionId, staffName: coach, workDate: sessionDate, startTime: "", endTime: "", hours: -1, notes: "" })).rejects.toThrow("INVALID_HOURS");
  });
});

describe("a session that is not Futprep's", () => {
  it("cannot be given a plan or hours", async () => {
    await expect(saveFutprepSessionPlan({ sessionId: -1, title: "x", planText: "", parentNote: "", attachmentUrl: "", updatedBy: coach })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(saveFutprepWorkLog({ sessionId: -1, staffName: coach, workDate: sessionDate, startTime: "", endTime: "", hours: 1, notes: "" })).rejects.toThrow("SESSION_NOT_FOUND");
  });
});

describe.skipIf(!anonKey)("through a browser key", () => {
  it("neither table gives anything back", async () => {
    const anon = createClient(url, anonKey ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    for (const table of ["session_plans", "staff_work_logs"]) {
      const { data, error } = await anon.from(table).select("*").eq("session_id", sessionId);
      expect(error !== null || (data ?? []).length === 0, `anon must get nothing from ${table}`).toBe(true);
    }
  });
});
