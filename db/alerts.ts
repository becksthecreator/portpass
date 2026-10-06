import { ALERTS, alertPeriodKey, deviceHash, deviceLabel, FAILED_LOGIN_KINDS, securityAlertEmail, type AlertFacts, type AlertKind, type SecurityEventKind } from "@/lib/alerts";
import { platformOwnerEmails } from "@/lib/auth/env";
import { clientIp } from "@/lib/auth/rateLimit";
import { portpassFrom, sendEmail } from "@/lib/email";
import { countSiteErrors } from "./adminHealth";
import { claimJobRun } from "./growth";
import { countSecurityEvents, recordSecurityEvent, rememberAdminDevice } from "./securityEvents";

// The security alerts, the part that counts and sends (Brief 21, part G).
// Each entry point is safe to call from a request path: it never throws
// (an alert that cannot be sent is logged, not raised) and the caller
// should run it after the response (lib/afterResponse.ts) so nobody waits
// for it. Every email goes to the founders (PLATFORM_OWNER_EMAILS), at most
// once an hour per kind (job_runs claim), through lib/email.ts, which
// writes it to the Messages log as template "security_alert".

// One Messages-log template per kind, so Admin -> Security can say when
// each alert last went out: security_alert_failed_logins and so on.
export const alertTemplate = (kind: AlertKind) => `security_alert_${kind}`;

async function sendSecurityAlert(kind: AlertKind, facts: AlertFacts): Promise<"sent" | "quiet" | "nobody" | "failed"> {
  const recipients = platformOwnerEmails();
  if (recipients.length === 0) {
    console.warn("security alert: PLATFORM_OWNER_EMAILS is not set, so nobody was told", { kind });
    return "nobody";
  }
  const claimed = await claimJobRun("security-alert", alertPeriodKey(kind, facts.at));
  if (!claimed) return "quiet";
  const email = securityAlertEmail(kind, facts);
  let sent = false;
  for (const to of recipients) {
    const outcome = await sendEmail({ to, subject: email.subject, html: email.html, from: portpassFrom(), log: { template: alertTemplate(kind) } });
    if (outcome === "sent") sent = true;
  }
  return sent ? "sent" : "failed";
}

const quiet = (where: string) => (error: unknown) => console.error(`security alert: ${where}`, error instanceof Error ? error.message : "");

// A wrong sign-in code, staff PIN or admin code. Counted; at ten in ten
// minutes the founders are told.
export async function recordFailedSignIn(kind: Extract<SecurityEventKind, "login_failed" | "pin_failed" | "admin_code_failed">, ip: string | null, now: Date = new Date()): Promise<void> {
  try {
    await recordSecurityEvent(kind, ip);
    const alert = ALERTS.find((a) => a.kind === "failed_logins")!;
    const since = new Date(now.getTime() - (alert.windowMinutes ?? 10) * 60_000).toISOString();
    const kinds = await countSecurityEvents(FAILED_LOGIN_KINDS, since);
    const count = Object.values(kinds).reduce((sum, n) => sum + (n ?? 0), 0);
    if (count >= (alert.threshold ?? 10)) await sendSecurityAlert("failed_logins", { count, windowMinutes: alert.windowMinutes ?? 10, kinds, at: now });
  } catch (error) {
    quiet("failed sign-in")(error);
  }
}

// A platform owner passed the admin second step: remember the device, and
// if it is new, say so.
export async function noteAdminSignIn(userId: string, request: Request, now: Date = new Date()): Promise<void> {
  try {
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent");
    const label = deviceLabel(userAgent);
    const { isNew } = await rememberAdminDevice(userId, await deviceHash(userAgent, ip), label, now);
    if (!isNew) return;
    await recordSecurityEvent("admin_new_device", ip, { label, user: userId.slice(0, 8) });
    await sendSecurityAlert("admin_new_device", { label, ip, userShort: userId.slice(0, 8), at: now });
  } catch (error) {
    quiet("admin sign-in")(error);
  }
}

// A /api/cron route was called while CRON_SECRET is unset.
export async function alertCronUnset(path: string, now: Date = new Date()): Promise<void> {
  try {
    await recordSecurityEvent("cron_unset", null, { path });
    await sendSecurityAlert("cron_unset", { path, at: now });
  } catch (error) {
    quiet("cron unset")(error);
  }
}

// After a server-side error was counted: twenty in ten minutes is a spike.
export async function checkSiteErrorSpike(now: Date = new Date()): Promise<void> {
  try {
    const alert = ALERTS.find((a) => a.kind === "site_errors_spike")!;
    const since = new Date(now.getTime() - (alert.windowMinutes ?? 10) * 60_000).toISOString();
    const count = await countSiteErrors(since);
    if (count < (alert.threshold ?? 20)) return;
    const claimed = await claimJobRun("security-alert", alertPeriodKey("site_errors_spike", now));
    if (!claimed) return;
    await recordSecurityEvent("site_errors_spike", null, { count });
    // The claim is already taken above; send directly so the event and the
    // email share one hour.
    const recipients = platformOwnerEmails();
    const email = securityAlertEmail("site_errors_spike", { count, windowMinutes: alert.windowMinutes ?? 10, at: now });
    for (const to of recipients) await sendEmail({ to, subject: email.subject, html: email.html, from: portpassFrom(), log: { template: alertTemplate("site_errors_spike") } });
  } catch (error) {
    quiet("site errors")(error);
  }
}
