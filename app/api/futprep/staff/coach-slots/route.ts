import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { addWeeklyCoachSlots } from "@/db/coaches";

// Coaches post weekly repeating times parents can pick (brief 06 v2,
// Part B): a day, a start and end time, how many weeks. Phone-first form
// on /futprep/staff/private-sessions.
export async function POST(request: Request) {
  const [account, role] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole()]);
  if (!account || !role || role === "helper") return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const coachId = Number(body.coachId);
  const weeks = Number(body.weeks);
  const dayOfWeek = String(body.dayOfWeek ?? "");
  const startTime = String(body.startTime ?? "").trim().slice(0, 20);
  const endTime = String(body.endTime ?? "").trim().slice(0, 20);
  const location = String(body.location ?? "").trim().slice(0, 120);
  if (!Number.isInteger(coachId) || coachId < 1 || !startTime || !endTime || !Number.isInteger(weeks) || weeks < 1 || weeks > 26) {
    return NextResponse.json({ error: "Choose a coach, a day, the times and 1 to 26 weeks." }, { status: 400 });
  }

  try {
    const added = await addWeeklyCoachSlots({ coachId, dayOfWeek, startTime, endTime, weeks, location, actor: account });
    return NextResponse.json({ ok: true, added }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_DAY") return NextResponse.json({ error: "Choose a day of the week." }, { status: 400 });
    if (message === "COACH_NOT_FOUND") return NextResponse.json({ error: "That coach isn't active." }, { status: 404 });
    console.error("coach slots error", error);
    return NextResponse.json({ error: "Could not add the times." }, { status: 500 });
  }
}
