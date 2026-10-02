// Admin -> Health and Settings (brief 08, 1.1 and 1.12): what can be told
// from this running copy of the site, with no database in it.

// Which version is running, from what the host tells the app. Only the
// short commit and the environment's name.
export function deploymentInfo(env: Record<string, string | undefined> = process.env): { commit: string | null; environment: string | null } {
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? "";
  return { commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null, environment: env.VERCEL_ENV ?? null };
}

// A nightly backup that has not reported in for a day and a half is late.
export const BACKUP_LATE_HOURS = 36;

export type BackupState = { state: "never" | "ok" | "late" | "failed" | "unknown"; at: string | null };

export function backupState(heartbeat: { at: string; ok: boolean } | null | undefined, now: Date): BackupState {
  if (heartbeat === undefined) return { state: "unknown", at: null };
  if (!heartbeat) return { state: "never", at: null };
  const at = Date.parse(heartbeat.at);
  if (Number.isNaN(at)) return { state: "unknown", at: null };
  if (!heartbeat.ok) return { state: "failed", at: heartbeat.at };
  return { state: now.getTime() - at > BACKUP_LATE_HOURS * 3600_000 ? "late" : "ok", at: heartbeat.at };
}

// What is switched on, by the NAMES of the settings it needs. Whether each
// one is set, never its value.
export type Switch = { label: string; on: boolean; needs: string[]; note: string };

export function systemSwitches(env: Record<string, string | undefined> = process.env): Switch[] {
  const set = (...names: string[]) => names.every((name) => Boolean(env[name]?.trim()));
  return [
    { label: "Sending email from PortPass", on: set("RESEND_API_KEY") && (set("PORTPASS_FROM_EMAIL") || set("FUTPREP_FROM_EMAIL")), needs: ["RESEND_API_KEY", "PORTPASS_FROM_EMAIL"], note: "Owner notices, invitations, reminders and the monthly report." },
    { label: "Sending email to Futprep parents", on: set("RESEND_API_KEY", "FUTPREP_FROM_EMAIL"), needs: ["RESEND_API_KEY", "FUTPREP_FROM_EMAIL"], note: "Registration, payment and private-session emails." },
    { label: "Delivered and bounced in Messages", on: set("RESEND_WEBHOOK_SECRET"), needs: ["RESEND_WEBHOOK_SECRET"], note: "Add a webhook in Resend pointing at /api/webhooks/resend for delivered, bounced, complained and failed, and put its signing secret here." },
    { label: "Scheduled jobs", on: set("CRON_SECRET"), needs: ["CRON_SECRET"], note: "The daily job, the monthly growth report and the Saturday attendance reminder." },
    { label: "Backup heartbeat", on: set("BACKUP_HEARTBEAT_SECRET"), needs: ["BACKUP_HEARTBEAT_SECRET"], note: "Lets the backup machine report in, for the Last database backup tile." },
    { label: "Founders' admin access", on: set("PLATFORM_OWNER_EMAILS"), needs: ["PLATFORM_OWNER_EMAILS"], note: "Whose first sign-in makes them a platform owner." },
    { label: "Leads: Google Places search", on: set("GOOGLE_PLACES_API_KEY"), needs: ["GOOGLE_PLACES_API_KEY"], note: "Search for businesses from Admin, Leads." },
    { label: "Leads: Instagram lookup", on: set("INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_GRAPH_ACCESS_TOKEN"), needs: ["INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_GRAPH_ACCESS_TOKEN"], note: "Reads a business's public Instagram profile." },
    { label: "Leads: AI summary and first message", on: set("ANTHROPIC_API_KEY"), needs: ["ANTHROPIC_API_KEY"], note: "Suggests a section, a score and a first message to edit." },
    { label: "Wedding enquiry notices", on: set("WEDDING_DESK_NOTIFY_EMAIL", "RESEND_API_KEY", "FUTPREP_FROM_EMAIL"), needs: ["WEDDING_DESK_NOTIFY_EMAIL", "RESEND_API_KEY", "FUTPREP_FROM_EMAIL"], note: "Emails the Wedding Desk when an enquiry arrives." },
  ];
}
