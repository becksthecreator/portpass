import Link from "next/link";
import { DATABASE_CHECK_LABEL, databaseChecks, getBackupHeartbeat, listSiteErrors } from "@/db/adminHealth";
import { requireAdmin } from "@/lib/auth/admin";
import { backupState, deploymentInfo } from "@/lib/adminHealth";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Health | PortPass admin",
  robots: { index: false, follow: false },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-BS", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" });
}

// A section that can't be read says so and leaves the rest of the page up.
async function attempt<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`admin health: ${what}`, error instanceof Error ? error.message : "");
    return null;
  }
}

// Health (brief 08, 1.1): what is running, what failed on the server in
// the last month, when the database was last backed up, and the database's
// own safety checks. No error message and no customer detail is kept or
// shown: an error is a route, a kind and a digest to look up in the host's
// logs.
export default async function AdminHealthPage() {
  const session = await requireAdmin("/admin/health");
  // The heartbeat is null when no backup has ever reported in, so a failed
  // read is kept apart as undefined.
  const [errors, heartbeat, checks] = await Promise.all([
    attempt("site errors", () => listSiteErrors()),
    getBackupHeartbeat().catch((error) => {
      console.error("admin health: backup heartbeat", error instanceof Error ? error.message : "");
      return undefined;
    }),
    attempt("database checks", () => databaseChecks()),
  ]);
  const deployment = deploymentInfo();
  const backedUp = backupState(heartbeat, new Date());

  return (
    <AdminShell session={session} current="/admin" title="Health" lede="What is running, what has failed, and whether the backups and the database's safety checks are in order." actions={<Link className="admin-bar-link" href="/admin">Overview</Link>}>
      <dl className="admin-facts">
        <div><dt>Running now</dt><dd>{deployment.commit ? <>Version <code>{deployment.commit}</code></> : "This copy doesn't say which version it is"}{deployment.environment ? ` · ${deployment.environment}` : ""}</dd></div>
        <div><dt>Last database backup</dt><dd>{backedUp.state === "unknown" || !backedUp.at ? (backedUp.state === "never" ? "No backup has reported in yet" : "Could not be read") : <>{when(backedUp.at)}{backedUp.state === "failed" ? " · it failed" : backedUp.state === "late" ? " · more than 36 hours ago" : ""}</>}</dd></div>
        {checks === null ? (
          <div><dt>Database checks</dt><dd>Could not be run</dd></div>
        ) : (
          checks.map((check) => (
            <div key={check.name}><dt>{DATABASE_CHECK_LABEL[check.name] ?? check.name}</dt><dd>{check.problems === 0 ? "None" : <strong className="admin-owing">{check.problems}</strong>}</dd></div>
          ))
        )}
      </dl>

      <section className="admin-group" aria-labelledby="health-errors">
        <h2 id="health-errors">Server errors, last 30 days</h2>
        {errors === null ? (
          <p className="admin-empty">Could not load the errors. Refresh to try again.</p>
        ) : errors.length === 0 ? (
          <p className="admin-empty">None recorded.</p>
        ) : (
          <>
            <p className="admin-form-note">The newest {errors.length}. Search the host&rsquo;s logs for the digest to see the full error. Addresses and error messages are not kept here.</p>
            <table className="admin-table">
              <thead><tr><th>When</th><th>Page or route</th><th>Kind</th><th>Digest</th></tr></thead>
              <tbody>
                {errors.map((error) => (
                  <tr key={error.id}>
                    <td data-label="When">{when(error.createdAt)}</td>
                    <td data-label="Page or route"><code>{error.route}</code>{error.routeType ? ` · ${error.routeType}` : ""}</td>
                    <td data-label="Kind">{error.errorName || "Error"}</td>
                    <td data-label="Digest">{error.digest ? <code>{error.digest}</code> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </AdminShell>
  );
}
