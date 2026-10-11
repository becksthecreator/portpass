import { platformOwnerEmails } from "@/lib/auth/env";
import { portpassEmailShell, portpassFrom, sendEmail } from "@/lib/email";
import { claimJobRun } from "./growth";
import { countPendingSellers } from "./marketSellers";

// The founders' alert when someone asks to sell on PortPass Market (brief
// 25, A4). It goes the way Brief 21's alerts go (db/alerts.ts): an email to
// PLATFORM_OWNER_EMAILS, at most once an hour (a job_runs claim), written
// to the Messages log. It is not a security alert, so it is not listed on
// Admin -> Security. The email carries a count and a link, never anything
// the applicant typed. It never throws: run it after the response
// (lib/afterResponse.ts) so nobody waits for it.
export const SELLER_ALERT_TEMPLATE = "market_seller_applied";

export function sellerAlertEmail(pending: number): { subject: string; html: string } {
  const subject = pending === 1 ? "PortPass Market: a seller is waiting to be verified" : `PortPass Market: ${pending} sellers are waiting to be verified`;
  const html = portpassEmailShell(
    "A seller applied",
    `<p>Someone has asked to sell on PortPass Market. ${pending === 1 ? "One seller is" : `${pending} sellers are`} waiting for a platform owner to check the business licence number and the contact person.</p>
     <p>Nothing of theirs is public until you verify them: Admin → Market → Sellers (portpassbahamas.com/admin/market).</p>
     <p style="color:#647069;font-size:12px">Sent at most once an hour.</p>`,
  );
  return { subject, html };
}

export async function alertSellerApplied(now: Date = new Date()): Promise<"sent" | "quiet" | "nobody" | "failed"> {
  try {
    const recipients = platformOwnerEmails();
    if (recipients.length === 0) {
      console.warn("market alert: PLATFORM_OWNER_EMAILS is not set, so nobody was told about a seller");
      return "nobody";
    }
    const claimed = await claimJobRun("market-alert", `seller_applied:${now.toISOString().slice(0, 13)}`);
    if (!claimed) return "quiet";
    const email = sellerAlertEmail(Math.max(1, await countPendingSellers()));
    let sent = false;
    for (const to of recipients) {
      const outcome = await sendEmail({ to, subject: email.subject, html: email.html, from: portpassFrom(), log: { template: SELLER_ALERT_TEMPLATE } });
      if (outcome === "sent") sent = true;
    }
    return sent ? "sent" : "failed";
  } catch (error) {
    console.error("market alert: seller applied", error instanceof Error ? error.message : "");
    return "failed";
  }
}
