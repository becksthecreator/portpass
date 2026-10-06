// The security alerts (Brief 21, part G), the pure part: what is watched,
// the thresholds, how a device is recognised, and the email. Nothing here
// touches the database or sends anything; db/alerts.ts does that with
// these definitions. Unit-tested in lib/alerts.test.ts. No Node-only
// modules: instrumentation.ts pulls this in through db/alerts.ts, and it is
// bundled for the edge runtime too.
//
// Every alert goes to the founders (PLATFORM_OWNER_EMAILS) through Resend,
// at most once an hour per alert, and says counts, kinds, addresses and
// times: never an email address someone typed, never a PIN or a code.

export type SecurityEventKind = "login_failed" | "pin_failed" | "admin_code_failed" | "admin_new_device" | "cron_unset" | "site_errors_spike";
export type AlertKind = "failed_logins" | "admin_new_device" | "cron_unset" | "site_errors_spike";

export type AlertDefinition = {
  kind: AlertKind;
  label: string;
  // Plain words for Admin -> Security.
  rule: string;
  // Counted over this window, in minutes (null: fires on the event itself).
  windowMinutes: number | null;
  threshold: number | null;
};

export const FAILED_LOGIN_KINDS: readonly SecurityEventKind[] = ["login_failed", "pin_failed", "admin_code_failed"];

export const ALERTS: readonly AlertDefinition[] = [
  { kind: "failed_logins", label: "Failed sign-ins", rule: "10 or more wrong sign-in codes, staff PINs or admin codes in 10 minutes, from anywhere.", windowMinutes: 10, threshold: 10 },
  { kind: "admin_new_device", label: "Admin sign-in from a new device", rule: "A platform owner passed the admin second step from a browser and network not seen before.", windowMinutes: null, threshold: null },
  { kind: "cron_unset", label: "A scheduled job ran without its secret", rule: "A /api/cron route was called while CRON_SECRET is unset (the call was refused with 503).", windowMinutes: null, threshold: null },
  { kind: "site_errors_spike", label: "Spike in site errors", rule: "20 or more server-side errors in 10 minutes.", windowMinutes: 10, threshold: 20 },
];

export const ALERT_QUIET_MINUTES = 60;
export const SECURITY_EVENTS_KEPT_DAYS = 90;

export function alertDefinition(kind: AlertKind): AlertDefinition {
  return ALERTS.find((a) => a.kind === kind)!;
}

// One alert of a kind per hour: the period key the job_runs claim uses.
export function alertPeriodKey(kind: AlertKind, now: Date): string {
  return `${kind}:${now.toISOString().slice(0, 13)}`;
}

// ---- devices ---------------------------------------------------------------

// A device is the browser's description plus the network it came from
// (the first three parts of an IPv4 address, or the first four groups of an
// IPv6 one), hashed. The same phone on the same home connection is one
// device; a laptop, or the phone on another network, is another.
export function networkOf(ip: string | null | undefined): string {
  const value = (ip ?? "").trim();
  if (!value) return "";
  if (value.includes(":")) return value.split(":").slice(0, 4).join(":");
  const parts = value.split(".");
  return parts.length === 4 ? parts.slice(0, 3).join(".") : value;
}

export async function deviceHash(userAgent: string | null | undefined, ip: string | null | undefined): Promise<string> {
  const bytes = new TextEncoder().encode(`${(userAgent ?? "").trim()}\n${networkOf(ip)}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// "Safari on iPhone", "Chrome on Windows": enough to recognise, nothing more.
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" : /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari" : "A browser";
  const system = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${system}`;
}

// ---- which business API calls are settings changes --------------------------

// Every write through the business and payments API that changes how a
// business is set up is audited (who, what path, IP). Day-to-day work on
// records (attendance, a registration, a booking, a reservation, a perk
// check) is not: it has its own, more specific audit entries where they
// matter, and would drown the trail otherwise.
export function isBusinessSettingsPath(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const m = /^\/api\/(business|payments)\/orgs\/\d+(\/(.*))?$/.exec(path);
  if (!m) return false;
  const rest = m[3] ?? "";
  if (rest === "") return true; // the business itself (name, colours, contact)
  const head = rest.split("/")[0];
  if (head === "perks") return !/^perks\/(check|redeem)$/.test(rest);
  return ["payment-methods", "settings", "team", "invites", "shop", "images", "offerings", "programs"].includes(head);
}

// ---- the email --------------------------------------------------------------

export type AlertFacts = { count?: number; windowMinutes?: number; kinds?: Partial<Record<SecurityEventKind, number>>; ip?: string | null; label?: string | null; path?: string | null; userShort?: string | null; at: Date };

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const KIND_LABEL: Record<SecurityEventKind, string> = {
  login_failed: "wrong sign-in codes",
  pin_failed: "wrong staff PINs",
  admin_code_failed: "wrong admin authenticator codes",
  admin_new_device: "new admin devices",
  cron_unset: "jobs refused for a missing secret",
  site_errors_spike: "error spikes",
};

export function securityAlertEmail(kind: AlertKind, facts: AlertFacts): { subject: string; html: string; text: string } {
  const when = facts.at.toLocaleString("en-BS", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Nassau" });
  let subject = "";
  let lines: string[] = [];
  switch (kind) {
    case "failed_logins": {
      subject = `PortPass security: ${facts.count ?? 0} failed sign-ins in ${facts.windowMinutes ?? 10} minutes`;
      const breakdown = Object.entries(facts.kinds ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${n} ${KIND_LABEL[k as SecurityEventKind]}`);
      lines = [`${facts.count ?? 0} failed sign-in attempts were made in the last ${facts.windowMinutes ?? 10} minutes${breakdown.length ? ` (${breakdown.join(", ")})` : ""}.`, "Someone may be guessing. Nothing has been opened: a wrong code or PIN opens nothing, accounts lock after five wrong PINs, and codes expire.", "What to do: open Admin → Security and read which addresses are trying. If it keeps going, turn on Attack Challenge Mode in Vercel (docs/security/incident-response.md)."];
      break;
    }
    case "admin_new_device":
      subject = "PortPass security: admin sign-in from a new device";
      lines = [`A platform owner (${facts.userShort ?? "?"}) passed the admin second step from a device not seen before: ${facts.label ?? "a browser"}, address ${facts.ip ?? "unknown"}, at ${when}.`, "If that was you, nothing to do. If it was not, sign that account out everywhere from Admin → People now, and change the authenticator."];
      break;
    case "cron_unset":
      subject = "PortPass security: a scheduled job ran without its secret";
      lines = [`${facts.path ?? "A /api/cron route"} was called at ${when} while CRON_SECRET is not set. The call was refused (503) and the job did not run.`, "What to do: set CRON_SECRET in Vercel and redeploy (docs/security/env-vars.md). Until then the daily job, the attendance reminder and the demo reset do not run."];
      break;
    case "site_errors_spike":
      subject = `PortPass security: ${facts.count ?? 0} site errors in ${facts.windowMinutes ?? 10} minutes`;
      lines = [`${facts.count ?? 0} server-side errors were recorded in the last ${facts.windowMinutes ?? 10} minutes.`, "What to do: Admin → Health shows which routes; Vercel's logs hold the details. A spike after a deploy usually means a bad release: roll it back in Vercel."];
      break;
  }
  const text = lines.join("\n\n");
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0d1b3d;line-height:1.5">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}<p style="color:#647069;font-size:12px">Sent once an hour at most per kind of alert. Settings: Admin → Security.</p></div>`;
  return { subject, html, text };
}
