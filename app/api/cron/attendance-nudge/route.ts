import { NextResponse } from "next/server";
import { claimJobRun, futprepOrganization, logMessage, releaseJobRun, sessionsToNudge } from "@/db/growth";
import { cronAuthorized } from "@/lib/cron";
import { portpassFrom, sendEmail } from "@/lib/email";
import { isNudgeWindow, nassauClock } from "@/lib/growth";
import { attendanceNudgeEmail } from "@/lib/growthEmail";

export const dynamic = "force-dynamic";

// @public-route: called by Vercel Cron on Saturday morning; lib/cron.ts
// refuses anything that does not carry the project's cron secret. It is
// scheduled at 12:45 and 13:45 UTC because the clocks change in November
// and March; whichever run lands at about 8:45 in Nassau does the work,
// and each session is nudged once.
//
// Emails the coach on duty for each of today's sessions: "Mark today's
// attendance", with a link straight to that roster. A coach with no email
// address on their staff account is skipped, and the Messages log says so.
// If a send fails the session is released so the next run tries again.
// Nothing is ever sent to a parent.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const now = new Date();
  if (!isNudgeWindow(nassauClock(now))) return NextResponse.json({ ok: true });

  const organization = await futprepOrganization();
  if (!organization) return NextResponse.json({ ok: true });

  try {
    for (const session of await sessionsToNudge(organization.id, now)) {
      const period = `session:${session.sessionId}`;
      if (!(await claimJobRun("attendance-nudge", period))) continue;
      let failed = false;
      try {
        if (session.coaches.length === 0) {
          await logMessage({ organizationId: organization.id, template: "attendance_nudge", recipient: "(no coach on file)", status: "skipped", detail: `${session.programName}: no coach recorded for today.` });
        }
        for (const coach of session.coaches) {
          if (!coach.email) {
            await logMessage({ organizationId: organization.id, template: "attendance_nudge", recipient: coach.name, status: "skipped", detail: "No email address on this coach's staff account." });
            continue;
          }
          const email = attendanceNudgeEmail({ coachName: coach.name, programName: session.programName, startTime: session.startTime, sessionId: session.sessionId });
          const outcome = await sendEmail({ to: coach.email, subject: email.subject, html: email.html, from: portpassFrom(), log: { template: "attendance_nudge", organizationId: organization.id } });
          if (outcome === "failed") failed = true;
        }
      } catch (error) {
        failed = true;
        console.error("attendance nudge: session", error instanceof Error ? error.message : "");
      }
      if (failed) await releaseJobRun("attendance-nudge", period).catch(() => {});
    }
  } catch (error) {
    console.error("attendance nudge", error instanceof Error ? error.message : "");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
