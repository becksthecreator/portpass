import Link from "next/link";
import { listMessages } from "@/db/adminHealth";
import { alertTemplate } from "@/db/alerts";
import { listAudit } from "@/db/audit";
import { countSecurityEvents, failedSignInsByAddress, listAdminDevices, listSecurityEvents } from "@/db/securityEvents";
import { ALERTS, FAILED_LOGIN_KINDS, type SecurityEventKind } from "@/lib/alerts";
import { requireAdmin } from "@/lib/auth/admin";
import { platformOwnerEmails } from "@/lib/auth/env";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Security | PortPass admin",
  robots: { index: false, follow: false },
};

const when = (iso: string) => new Date(iso).toLocaleString("en-BS", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Nassau" });

const KIND_LABEL: Record<SecurityEventKind, string> = {
  login_failed: "Wrong sign-in code",
  pin_failed: "Wrong staff PIN",
  admin_code_failed: "Wrong admin code",
  admin_new_device: "Admin sign-in from a new device",
  cron_unset: "Job refused: CRON_SECRET unset",
  site_errors_spike: "Spike in site errors",
};

// Admin -> Security (Brief 21, part G): the alerts and who gets them, what
// has been counted lately, the devices the owners sign in from, and the
// last admin actions with where they came from. Read-only: nothing here
// changes a setting; the thresholds live in lib/alerts.ts and the
// recipients in PLATFORM_OWNER_EMAILS (names of settings, never values of
// secrets). Nothing on this page is an email address someone typed into a
// form, a PIN or a code.
export default async function AdminSecurityPage() {
  const session = await requireAdmin("/admin/security");
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
  const safe = <T,>(label: string, work: () => Promise<T>, fallback: T) => work().catch((error): T => {
    console.error(`admin security: ${label}`, error instanceof Error ? error.message : "");
    return fallback;
  });
  const [lastDay, lastTenMinutes, addresses, devices, events, actions, sentAlerts] = await Promise.all([
    safe("counts", () => countSecurityEvents(FAILED_LOGIN_KINDS, dayAgo), {}),
    safe("recent counts", () => countSecurityEvents(FAILED_LOGIN_KINDS, tenMinutesAgo), {}),
    safe("addresses", () => failedSignInsByAddress(FAILED_LOGIN_KINDS, dayAgo, 10), []),
    safe("devices", () => listAdminDevices(30), []),
    safe("events", () => listSecurityEvents(60), []),
    safe("actions", () => listAudit({ limit: 60 }), []),
    Promise.all(ALERTS.map((alert) => safe(`alerts sent: ${alert.kind}`, () => listMessages({ template: alertTemplate(alert.kind) }), []))),
  ]);
  const recipients = platformOwnerEmails();
  const total = (counts: Partial<Record<SecurityEventKind, number>>) => Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const lastSent = (index: number) => sentAlerts[index]?.find((m) => m.status === "sent")?.createdAt ?? null;

  return (
    <AdminShell session={session} current="/admin/security" title="Security" lede="What is watched, who is told, and what has happened lately. Read-only.">
      <section className="admin-section">
        <h2>Alerts</h2>
        <p className="admin-lede">Each goes by email to the platform owners{recipients.length ? ` (${recipients.length} address${recipients.length === 1 ? "" : "es"} in PLATFORM_OWNER_EMAILS)` : " (PLATFORM_OWNER_EMAILS is not set: nobody is told)"}, at most once an hour per kind. Every send is in <Link href="/admin/messages">Messages</Link> as <code>security alert …</code>.</p>
        <table className="admin-table">
          <thead><tr><th>Alert</th><th>Rule</th><th>Last sent</th></tr></thead>
          <tbody>
            {ALERTS.map((alert, index) => {
              const sent = lastSent(index);
              return (
                <tr key={alert.kind}>
                  <td data-label="Alert"><strong>{alert.label}</strong></td>
                  <td data-label="Rule">{alert.rule}</td>
                  <td data-label="Last sent">{sent ? when(sent) : "Never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="admin-lede">Vercel's firewall (Attack Challenge Mode, the rate-limit rules, bot protection) is switched on in Vercel itself: <code>docs/security/README.md</code> has the clicks.</p>
      </section>

      <section className="admin-section">
        <h2>Failed sign-ins</h2>
        <p className="admin-lede"><strong>{total(lastTenMinutes)}</strong> in the last 10 minutes, <strong>{total(lastDay)}</strong> in the last 24 hours{total(lastDay) ? ` (${FAILED_LOGIN_KINDS.filter((k) => lastDay[k]).map((k) => `${lastDay[k]} ${KIND_LABEL[k].toLowerCase()}`).join(", ")})` : ""}. The alert fires at 10 in 10 minutes.</p>
        {addresses.length > 0 && (
          <table className="admin-table">
            <thead><tr><th>Address</th><th>Failed attempts, 24 hours</th></tr></thead>
            <tbody>{addresses.map((row) => <tr key={row.ip}><td data-label="Address"><code>{row.ip}</code></td><td data-label="Failed attempts">{row.count}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="admin-section">
        <h2>Admin devices</h2>
        <p className="admin-lede">Browsers and networks the platform owners have passed the second step from. A new one emails everyone. If one is not yours, sign that account out everywhere from <Link href="/admin/people">People</Link>.</p>
        {devices.length === 0 ? <p className="admin-empty">None recorded yet. The first admin sign-in after this shipped will appear here.</p> : (
          <table className="admin-table">
            <thead><tr><th>Owner</th><th>Device</th><th>First seen</th><th>Last seen</th></tr></thead>
            <tbody>{devices.map((d) => <tr key={d.id}><td data-label="Owner"><code>{d.userId.slice(0, 8)}</code></td><td data-label="Device">{d.label}</td><td data-label="First seen">{when(d.firstSeenAt)}</td><td data-label="Last seen">{when(d.lastSeenAt)}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="admin-section">
        <h2>Recent events</h2>
        {events.length === 0 ? <p className="admin-empty">Nothing counted yet.</p> : (
          <table className="admin-table">
            <thead><tr><th>When</th><th>What</th><th>Address</th><th>Detail</th></tr></thead>
            <tbody>{events.map((e) => <tr key={e.id}><td data-label="When">{when(e.createdAt)}</td><td data-label="What">{KIND_LABEL[e.kind] ?? e.kind}</td><td data-label="Address"><code>{e.ip ?? ""}</code></td><td data-label="Detail"><code>{e.detail ? JSON.stringify(e.detail).slice(0, 120) : ""}</code></td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="admin-section">
        <h2>Recent admin actions</h2>
        <p className="admin-lede">The last 60 entries of the <Link href="/admin/audit">audit log</Link>, with the address each came from. Every admin API call that changes something is here as <code>admin.api</code>; every settings change on a business as <code>business.settings.api</code>.</p>
        <table className="admin-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>What</th><th>Address</th></tr></thead>
          <tbody>
            {actions.map((row) => (
              <tr key={row.id}>
                <td data-label="When">{when(row.createdAt)}</td>
                <td data-label="Actor"><code>{row.actorUserId ? row.actorUserId.slice(0, 8) : "system"}</code></td>
                <td data-label="Action">{row.action}</td>
                <td data-label="What">{row.targetTable ?? ""}{row.targetId ? ` #${row.targetId}` : ""}{row.organizationId ? ` · org ${row.organizationId}` : ""}{row.after && typeof row.after === "object" && "path" in (row.after as object) ? ` · ${String((row.after as { method?: unknown }).method ?? "")} ${String((row.after as { path?: unknown }).path ?? "")}` : ""}</td>
                <td data-label="Address"><code>{row.ip ?? ""}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
