import { listAdminPeople } from "@/db/adminPeople";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPhoneDisplay } from "@/lib/phone";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "People | PortPass admin",
  robots: { index: false, follow: false },
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-BS", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Nassau" }) : "never";
}

// All accounts: name, email/phone, last seen, memberships and roles.
// Changing roles, revoking access, resending invites and force sign-out
// arrive in the next build (A3).
export default async function AdminPeoplePage() {
  const session = await requireAdmin("/admin/people");
  const people = await listAdminPeople();

  return (
    <AdminShell session={session} current="/admin/people" title="People & access" lede={`${people.length} account${people.length === 1 ? "" : "s"}. Role changes and access controls land in the next build.`}>
      {people.length === 0 ? (
        <p className="admin-empty">Nobody has signed in yet. Once PLATFORM_OWNER_EMAILS is set in Vercel, the founders&rsquo; first sign-in makes them platform owners.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Person</th><th>Contact</th><th>Platform role</th><th>Businesses</th><th>Last seen</th><th>Joined</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.userId}>
                <td data-label="Person"><strong>{p.fullName}</strong></td>
                <td data-label="Contact">{p.email ?? "—"}{p.phoneE164 ? <><br /><small>{formatPhoneDisplay(p.phoneE164)}</small></> : null}</td>
                <td data-label="Platform role">{p.platformRole ? <span className="admin-pill live">{p.platformRole.replace("platform_", "")}</span> : "—"}</td>
                <td data-label="Businesses">{p.memberships.length ? p.memberships.map((m) => `${m.organizationName} (${m.role.replace("org_", "")})`).join(", ") : "—"}</td>
                <td data-label="Last seen">{when(p.lastSeenAt)}</td>
                <td data-label="Joined">{when(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
