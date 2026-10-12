import { NextResponse } from "next/server";
import { currentInboxViewer } from "@/app/futprep/staff/private-sessions/viewer";
import { getCoachDays, setCoachDayAway, setCoachWorkingDays } from "@/db/coaches";
import { bodyOf, readJson } from "@/lib/api/body";
import { cleanWorkingDays } from "@/lib/workingDays";
import { nassauToday } from "@/lib/futprepTerms";

// My days (brief 31, C2): a coach sets their own working days and days
// away. Which coach comes from the signed-in login (its linked profile),
// never from the request, so nobody can change another coach's days here.
// A day away is a blocked date: parents can't pick it, and the booking
// form says the coach is away.
const Body = bodyOf(["workingDays", "date", "away"]);

export async function POST(request: Request) {
  const { account, viewer } = await currentInboxViewer();
  if (!account || !viewer.role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (viewer.role === "helper") return NextResponse.json({ error: "Helpers don't take private sessions." }, { status: 403 });
  if (viewer.coachId === null) return NextResponse.json({ error: "Your login isn't linked to a coach profile yet. Ask Alex to link it on Coach pay." }, { status: 409 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body = read.value;
  const hasDays = body.workingDays !== undefined;
  const hasDate = body.date !== undefined;
  if (hasDays === hasDate) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    if (hasDays) {
      if (!Array.isArray(body.workingDays)) return NextResponse.json({ error: "Choose your working days." }, { status: 400 });
      const days = cleanWorkingDays(body.workingDays);
      if (days.length !== body.workingDays.length) return NextResponse.json({ error: "Choose your working days." }, { status: 400 });
      await setCoachWorkingDays(viewer.coachId, days);
    } else {
      const date = typeof body.date === "string" ? body.date : "";
      const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
      if (!real || typeof body.away !== "boolean") return NextResponse.json({ error: "Choose a date." }, { status: 400 });
      const yearAhead = new Date();
      yearAhead.setUTCDate(yearAhead.getUTCDate() + 366);
      if (date > yearAhead.toISOString().slice(0, 10)) return NextResponse.json({ error: "Choose a date within the next year." }, { status: 400 });
      if (body.away && date < nassauToday()) return NextResponse.json({ error: "Choose today or a later date." }, { status: 400 });
      await setCoachDayAway({ coachId: viewer.coachId, date, away: body.away, actor: account });
    }
    return NextResponse.json({ ok: true, days: await getCoachDays(viewer.coachId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "COACH_NOT_FOUND") return NextResponse.json({ error: "Your coach profile wasn't found." }, { status: 404 });
    if (message === "INVALID_DATE") return NextResponse.json({ error: "Choose a date." }, { status: 400 });
    if (message === "BOOKED_THAT_DAY") return NextResponse.json({ error: "You have a session booked that day. Ask the desk to move it first." }, { status: 409 });
    console.error("my days error", error);
    return NextResponse.json({ error: "Could not save your days." }, { status: 500 });
  }
}
