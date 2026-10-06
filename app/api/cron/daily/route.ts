import { NextResponse } from "next/server";
import { pruneHealthRecords } from "@/db/adminHealth";
import { prunePassChecks } from "@/db/memberPerks";
import { listOwnerEmails } from "@/db/business";
import { resetDemoBusiness } from "@/db/demo";
import { getSiteContent } from "@/db/siteContent";
import { bumpListings } from "@/lib/revalidate";
import { claimJobRun, futprepOrganization, getGrowthReport, logMessage, prunePageEvents, releaseJobRun, reportRecipients, syncCommissionEvents } from "@/db/growth";
import { cronGate } from "@/lib/cron";
import { runBillingStep } from "./billing";
import { portpassFrom, sendEmail } from "@/lib/email";
import { monthlyReportPeriod, nassauClock } from "@/lib/growth";
import { growthReportEmail } from "@/lib/growthEmail";

export const dynamic = "force-dynamic";

// @public-route: called by Vercel Cron once a day; lib/cron.ts refuses
// anything that does not carry the project's cron secret, and everything
// while CRON_SECRET is unset (503).
//
// 1. For a business on a commission plan, writes the fee for each payment
//    received from a commissionable family as a billing event. A business
//    that is not on a plan gets nothing written.
// 2. Removes page-event counts too old for the report to read, Messages
//    log lines older than a year and site-error lines older than a month.
// 0. PortPass's own billing (./billing.ts): drafts invoices that are due,
//    marks overdue ones, and sends the reminder emails owed today.
// 3. On the 1st of the month (Nassau), emails the business's owners last
//    month's growth report, once, and records it in the Messages log. If
//    nothing could be delivered the month is released, and the runs on the
//    next few days try again. Nothing is ever sent to a parent.
//
// 4. Puts the demo business (/demo) back to its starting point, with its
//    dates worked out from today.
//
// The answer says only that the job ran: what it did is in the audit trail
// (billing_events, message_log), not in a response anyone could read.
export async function GET(request: Request) {
  const gate = cronGate(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const now = new Date();
  const clock = nassauClock(now);
  const organization = await futprepOrganization().catch(() => null);

  // Fees follow the payments first, so billing drafts from what is true
  // today: a fee whose payment was voided is gone (or credited) before
  // anything is put on an invoice.
  if (organization) {
    try {
      await syncCommissionEvents(organization.id, now);
    } catch (error) {
      console.error("daily job: commission events", error instanceof Error ? error.message : "");
    }
  }
  // The demo business: whatever visitors pressed yesterday is gone.
  try {
    await resetDemoBusiness();
  } catch (error) {
    console.error("daily job: demo reset", error instanceof Error ? error.message : "");
  }
  // PortPass's own billing: drafts, overdue marks and reminder emails.
  try {
    await runBillingStep(clock.date);
  } catch (error) {
    console.error("daily job: billing", error instanceof Error ? error.message : "");
  }
  if (!organization) return NextResponse.json({ ok: true });

  try {
    await prunePageEvents(now);
  } catch (error) {
    console.error("daily job: page events retention", error instanceof Error ? error.message : "");
  }

  try {
    const { announcement } = await getSiteContent({ fresh: true });
    if (announcement.active && announcement.until && announcement.until < clock.date) bumpListings();
  } catch (error) {
    console.error("daily job: announcement expiry", error instanceof Error ? error.message : "");
  }

  try {
    await pruneHealthRecords(now);
  } catch (error) {
    console.error("daily job: messages log and site errors retention", error instanceof Error ? error.message : "");
  }
  // Member Pass checks are kept 30 days (brief 10; the Privacy Policy says so).
  try {
    await prunePassChecks(now.getTime());
  } catch (error) {
    console.error("daily job: pass checks retention", error instanceof Error ? error.message : "");
  }

  const month = monthlyReportPeriod(clock);
  if (month) {
    const job = "growth-report-email";
    const period = `${organization.id}:${month}`;
    let claimed = false;
    let delivered = false;
    try {
      claimed = await claimJobRun(job, period);
      if (claimed) {
        const recipients = await reportRecipients(organization.id, await listOwnerEmails(organization.id));
        if (recipients.length === 0) {
          // Nobody to send to yet. Said once, on the 1st; the month stays
          // open so the report goes as soon as an owner or an email address
          // is added during the retry days.
          if (clock.date.endsWith("-01")) {
            await logMessage({ organizationId: organization.id, template: "growth_report_monthly", recipient: "(no owner on file)", status: "skipped", detail: "No owner with a PortPass account, and no email on the CEO staff login." });
          }
        } else {
          const email = growthReportEmail(await getGrowthReport(organization, now), month);
          for (const to of recipients) {
            const outcome = await sendEmail({ to, subject: email.subject, html: email.html, from: portpassFrom(), log: { template: "growth_report_monthly", organizationId: organization.id } });
            // "skipped" means email is not connected: retrying today would not help.
            if (outcome !== "failed") delivered = true;
          }
        }
      }
    } catch (error) {
      console.error("daily job: growth report email", error instanceof Error ? error.message : "");
      await logMessage({ organizationId: organization.id, template: "growth_report_monthly", recipient: "(not sent)", status: "failed", detail: "The report could not be built or sent; it will be tried again." }).catch(() => {});
    }
    if (claimed && !delivered) await releaseJobRun(job, period).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
