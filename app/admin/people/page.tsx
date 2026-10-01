import { listAdminPeople, listOpenInvites, listStaffPinStatus } from "@/db/adminPeople";
import { requireAdmin } from "@/lib/auth/admin";
import { formatPhoneDisplay } from "@/lib/phone";
import { AdminShell } from "../_components/AdminShell";
import { MembershipControl, ResendInvite, SignOutEverywhere } from "./PeopleActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "People | PortPass admin",
  robots: { index: false, follow: false },
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-BS", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Nassau" }) : "never";
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-BS", { dateStyle: "medium", timeZone: "America/Nassau" });
}

// All accounts (brief 08, 1.5): name, email/phone, last seen, memberships
// and roles. From here a founder can change a person's role in a business,
// remove their access, sign them out everywhere and send an invitation
// again. Below: invitations not yet accepted, and staff PIN logins.
export default async function AdminPeoplePage() {
  const session = await requireAdmin("/admin/people");
  const [people, invites, pins] = await Promise.all([listAdminPeople(), listOpenInvites().catch(() => []), listStaffPinStatus().catch(() => [])]);

  return (
    <AdminShell session={session} current="/admin/people" title="People & access" lede={`${people.length} account${people.length === 1 ? "" : "s"}. Every change here is logged.`}>
      {people.length === 0 ? (
        <p className="admin-empty">Nobody has signed in yet. Once PLATFORM_OWNER_EMAILS is set in Vercel, the founders&rsquo; first sign-in makes them platform owners.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Person</th><th>Contact</th><th>Platform role</th><th>Businesses</th><th>Last seen</th><th>Joined</th><th>Access</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.userId}>
                <td data-label="Person"><strong>{p.fullName}</strong></td>
                <td data-label="Contact">{p.email ?? "—"}{p.phoneE164 ? <><br /><small>{formatPhoneDisplay(p.phoneE164)}</small></> : null}</td>
                <td data-label="Platform role">{p.platformRole ? <span className="admin-pill live">{p.platformRole.replace("platform_", "")}</span> : "—"}</td>
                <td data-label="Businesses">
                  {p.memberships.length
                    ? p.memberships.map((m) => <MembershipControl key={m.organizationId} userId={p.userId} personName={p.fullName} organizationId={m.organizationId} organizationName={m.organizationName} role={m.role} />)
                    : "—"}
                </td>
                <td data-label="Last seen">{when(p.lastSeenAt)}</td>
                <td data-label="Joined">{when(p.createdAt)}</td>
                <td data-label="Access"><SignOutEverywhere userId={p.userId} personName={p.fullName} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="admin-group" aria-labelledby="invites">
        <h2 id="invites">Invitations not yet accepted</h2>
        {invites.length === 0 ? (
          <p className="admin-empty">None waiting.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Business</th><th>Role</th><th>Sent</th><th>Expires</th><th>Send again</th></tr></thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td data-label="Email">{invite.email}</td>
                  <td data-label="Business">{invite.organizationName}</td>
                  <td data-label="Role">{invite.role.replace("org_", "")}</td>
                  <td data-label="Sent">{day(invite.createdAt)}</td>
                  <td data-label="Expires">{new Date(invite.expiresAt).getTime() < Date.now() ? <span className="admin-pill rejected">expired</span> : day(invite.expiresAt)}</td>
                  <td data-label="Send again"><ResendInvite inviteId={invite.id} email={invite.email} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-group" aria-labelledby="pins">
        <h2 id="pins">Staff PIN logins</h2>
        {pins.length === 0 ? (
          <p className="admin-empty">No staff PIN logins.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Business</th><th>Name</th><th>Role</th><th>Login</th><th>PIN</th></tr></thead>
            <tbody>
              {pins.map((pin, i) => (
                <tr key={`${pin.organizationName}-${pin.name}-${i}`}>
                  <td data-label="Business">{pin.organizationName}</td>
                  <td data-label="Name">{pin.name}</td>
                  <td data-label="Role">{pin.role}</td>
                  <td data-label="Login">{pin.active ? "Active" : <span className="admin-pill rejected">switched off</span>}</td>
                  <td data-label="PIN">{pin.pinChanged ? "Changed ✓" : <span className="admin-pill submitted">not changed yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AdminShell>
  );
}
