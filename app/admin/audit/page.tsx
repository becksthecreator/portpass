import Link from "next/link";
import { listAudit } from "@/db/audit";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit log | PortPass admin",
  robots: { index: false, follow: false },
};

const ACTIONS = ["business.created", "business.submitted", "business.went_live", "business.updated", "business.updated.re_review", "organization.bank_details.updated", "image.consent_confirmed", "image.consent_withdrawn", "staff.pin_changed", "admin.mfa.verified", "category.created", "category.updated", "profile.platform_owner_granted"];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-BS", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Nassau" });
}

function short(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

// Actor, action, target, before/after, time. Read-only by construction:
// there is no route that updates or deletes audit_log, and the table is
// service-role only.
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ org?: string; action?: string }> }) {
  const session = await requireAdmin("/admin/audit");
  const { org, action } = await searchParams;
  const organizationId = org && /^\d+$/.test(org) ? Number(org) : null;
  const rows = await listAudit({ organizationId, action: action || null, limit: 200 });

  return (
    <AdminShell session={session} current="/admin/audit" title="Audit log" lede="Who did what, to what, and when. Nobody can edit or delete this, including admins.">
      <div className="admin-filters" aria-label="Filter by action">
        <Link href={organizationId ? `/admin/audit?org=${organizationId}` : "/admin/audit"} aria-current={!action ? "true" : undefined}>All actions</Link>
        {ACTIONS.map((a) => (
          <Link key={a} href={`/admin/audit?action=${encodeURIComponent(a)}${organizationId ? `&org=${organizationId}` : ""}`} aria-current={action === a ? "true" : undefined}>{a}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="admin-empty">Nothing logged for this filter yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Before</th><th>After</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="When">{when(row.createdAt)}</td>
                <td data-label="Actor"><code>{row.actorUserId ? row.actorUserId.slice(0, 8) : "system"}</code></td>
                <td data-label="Action">{row.action}</td>
                <td data-label="Target">{row.targetTable ?? ""}{row.targetId ? ` #${row.targetId}` : ""}{row.organizationId ? <> · <Link href={`/admin/audit?org=${row.organizationId}`}>org {row.organizationId}</Link></> : null}</td>
                <td data-label="Before"><code>{short(row.before)}</code></td>
                <td data-label="After"><code>{short(row.after)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
