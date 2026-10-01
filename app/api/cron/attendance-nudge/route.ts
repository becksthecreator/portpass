import { NextResponse } from "next/server";
import { claimJobRun, futprepOrganization, logMessage, sessionsToNudge } from "@/db/growth";
import { cronAuthorized } from "@/lib/cron";
import { portpassFrom, sendEmail } from "@/lib/email";
import { isNudgeWindow, nassauClock } from "@/lib/growth";
import { attendanceNudgeEmail } from "@/lib/growthEmail";

export const dynamic = "force-dynamic";

// @public-route: called by Vercel Cron on Saturday morning (lib/cron.ts
// explains who may call it and why a stray call is harmless). It is
// scheduled at 12:45 and 13:45 UTC because the clocks change in November
// and March; whichever run lands in the morning in Nassau does the work,
// and each session is nudged once.
//
// Emails the coach on duty for each of today's sessions: "Mark today's
// attendance", with a link straight to that roster. A coach with no email
// address on their staff account is skipped, and the Messages log says so.
// Nothing is ever sent to a parent.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const now = new Date();
  const clock = nassauClock(now);
  if (!isNudgeWindow(clock)) return NextResponse.json({ ok: true, date: clock.date, nudged: 0, reason: "outside the morning window" });

  const organization = await futprepOrganization();
  if (!organization) return NextResponse.json({ ok: true, organization: null });

  let nudged = 0;
  let skipped = 0;
  try {
    for (const session of await sessionsToNudge(organization.id, now)) {
      if (!(await claimJobRun("attendance-nudge", `session:${session.sessionId}`))) continue;
      if (session.coaches.length === 0) {
        skipped += 1;
        await logMessage({ organizationId: organization.id, template: "attendance_nudge", recipient: "(no coach on file)", status: "skipped", detail: `${session.programName}: no coach recorded for today.` });
        continue;
      }
      for (const coach of session.coaches) {
        if (!coach.email) {
          skipped += 1;
          await logMessage({ organizationId: organization.id, template: "attendance_nudge", recipient: coach.name, status: "skipped", detail: "No email address on this coach's staff account." });
          continue;
        }
        const email = attendanceNudgeEmail({ coachName: coach.name, programName: session.programName, startTime: session.startTime, sessionId: session.sessionId });
        const outcome = await sendEmail({ to: coach.email, subject: email.subject, html: email.html, from: portpassFrom() });
        await logMessage({ organizationId: organization.id, template: "attendance_nudge", recipient: coach.email, status: outcome, detail: outcome === "skipped" ? "Email is not set up yet." : null });
        if (outcome === "sent") nudged += 1;
        else skipped += 1;
      }
    }
  } catch (error) {
    console.error("attendance nudge", error instanceof Error ? error.message : "");
    return NextResponse.json({ ok: false, date: clock.date, nudged, skipped }, { status: 500 });
  }
  return NextResponse.json({ ok: true, date: clock.date, nudged, skipped });
}
