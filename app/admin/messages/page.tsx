import Link from "next/link";
import { listMessages, MESSAGE_STATUSES, MESSAGES_ON_SCREEN, type MessageLogStatus } from "@/db/adminHealth";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Messages | PortPass admin",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<MessageLogStatus, string> = { sent: "Sent", delivered: "Delivered", bounced: "Bounced", complained: "Marked as spam", failed: "Failed", skipped: "Not sent" };
// The pill colours the admin table already has.
const STATUS_PILL: Record<MessageLogStatus, string> = { sent: "", delivered: "live", bounced: "suspended", complained: "suspended", failed: "suspended", skipped: "" };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-BS", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" });
}

const words = (template: string) => template.replace(/_/g, " ");

// The Messages log (brief 08, 1.10): every email PortPass tried to send,
// who it was for, which kind, and what became of it, so "I never got it"
// can be answered. Sign-in codes are sent by the sign-in service and are
// not here. The text of an email is never kept.
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const session = await requireAdmin("/admin/messages");
  const params = await searchParams;
  const status = params.status === "problems" ? "problems" : MESSAGE_STATUSES.find((s) => s === params.status) ?? null;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 254) : "";
  const messages = await listMessages({ status, q: q || null });

  const href = (next: string | null) => {
    const query = new URLSearchParams();
    if (next) query.set("status", next);
    if (q) query.set("q", q);
    const text = query.toString();
    return text ? `/admin/messages?${text}` : "/admin/messages";
  };

  return (
    <AdminShell session={session} current="/admin/messages" title="Messages" lede="Every email PortPass tried to send: who to, which kind, and whether it arrived. Never the email's text. Sign-in codes are not listed.">
      <div className="admin-filters" aria-label="Filter by what happened">
        <Link href={href(null)} aria-current={!status ? "true" : undefined}>All</Link>
        <Link href={href("problems")} aria-current={status === "problems" ? "true" : undefined}>Did not arrive</Link>
        {MESSAGE_STATUSES.map((s) => (
          <Link key={s} href={href(s)} aria-current={status === s ? "true" : undefined}>{STATUS_LABEL[s]}</Link>
        ))}
      </div>
      <form className="leads-filter" method="get" action="/admin/messages">
        {status && <input type="hidden" name="status" value={status} />}
        <label><span>Find one address (the whole address)</span><input name="q" type="email" defaultValue={q} placeholder="name@example.com" maxLength={254} autoCapitalize="none" /></label>
        <div className="leads-filter-actions">
          <button className="primary-button" type="submit">Find</button>
          {q && <Link href={status ? `/admin/messages?status=${status}` : "/admin/messages"}>Clear</Link>}
        </div>
      </form>

      {messages.length === 0 ? (
        <p className="admin-empty">{status || q ? "Nothing matches." : "No emails logged yet."}</p>
      ) : (
        <>
          {messages.length === MESSAGES_ON_SCREEN && <p className="admin-form-note">The newest {MESSAGES_ON_SCREEN} are listed. Find one address to see older ones.</p>}
          <table className="admin-table">
            <thead><tr><th>When</th><th>To</th><th>Kind of email</th><th>Business</th><th>What happened</th></tr></thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id}>
                  <td data-label="When">{when(message.createdAt)}</td>
                  <td data-label="To">{message.recipient}</td>
                  <td data-label="Kind of email">{words(message.template)}</td>
                  <td data-label="Business">{message.organizationName || "—"}</td>
                  <td data-label="What happened"><span className={`admin-pill ${STATUS_PILL[message.status]}`}>{STATUS_LABEL[message.status]}</span>{message.detail ? <><br /><small>{message.detail}</small></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="admin-form-note">&ldquo;Sent&rdquo; means the email service accepted it. &ldquo;Delivered&rdquo; and &ldquo;Bounced&rdquo; appear once the email service reports back, which needs its webhook connected (see Settings).</p>
    </AdminShell>
  );
}
