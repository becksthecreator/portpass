import { NextResponse } from "next/server";
import { listOwnerEmails } from "@/db/business";
import { claimJobRun, futprepOrganization, getGrowthReport, logMessage, syncCommissionEvents } from "@/db/growth";
import { cronAuthorized } from "@/lib/cron";
import { portpassFrom, sendEmail } from "@/lib/email";
import { monthlyReportPeriod, nassauClock } from "@/lib/growth";
import { growthReportEmail } from "@/lib/growthEmail";

export const dynamic = "force-dynamic";

// @public-route: called by Vercel Cron once a day (lib/cron.ts explains who
// may call it and why a stray call is harmless).
//
// 1. For a business on a commission plan, writes the fee for each payment
//    received from a commissionable family as a billing event. A business
//    that is not on a plan gets nothing written.
// 2. On the 1st of the month (Nassau), emails the business's owners last
//    month's growth report, once, and records it in the Messages log.
//    Nothing is ever sent to a parent.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const now = new Date();
  const clock = nassauClock(now);
  const organization = await futprepOrganization();
  if (!organization) return NextResponse.json({ ok: true, organization: null });

  let events: { written: number; removed: number } | null = null;
  try {
    events = await syncCommissionEvents(organization.id, now);
  } catch (error) {
    console.error("daily job: commission events", error instanceof Error ? error.message : "");
  }

  let report: "not_due" | "already_sent" | "no_recipient" | "sent" | "failed" = "not_due";
  const month = monthlyReportPeriod(clock);
  if (month) {
    try {
      if (!(await claimJobRun("growth-report-email", `${organization.id}:${month}`))) {
        report = "already_sent";
      } else {
        const recipients = await listOwnerEmails(organization.id);
        if (recipients.length === 0) {
          report = "no_recipient";
          await logMessage({ organizationId: organization.id, template: "growth_report_monthly", recipient: "(no owner on file)", status: "skipped", detail: "The business has no owner with a PortPass account." });
        } else {
          const email = growthReportEmail(await getGrowthReport(organization, now), month);
          report = "sent";
          for (const to of recipients) {
            const outcome = await sendEmail({ to, subject: email.subject, html: email.html, from: portpassFrom() });
            await logMessage({ organizationId: organization.id, template: "growth_report_monthly", recipient: to, status: outcome, detail: outcome === "skipped" ? "Email is not set up yet." : null });
            if (outcome !== "sent") report = "failed";
          }
        }
      }
    } catch (error) {
      report = "failed";
      console.error("daily job: growth report email", error instanceof Error ? error.message : "");
    }
  }
  return NextResponse.json({ ok: true, date: clock.date, commissionEvents: events, report });
}
