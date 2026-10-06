import Link from "next/link";
import { getPerkStats, listAllPerks } from "@/db/memberPerks";
import { requireAdmin } from "@/lib/auth/admin";
import { nassauToday } from "@/lib/futprepTerms";
import { isPerkLive, perkChip, perkConditions, shortDay, signupSourceLabel } from "@/lib/memberPerks";
import { AdminShell } from "../_components/AdminShell";
import { EndPerk } from "./EndPerk";
import "@/app/_components/perks/perks.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Member perks | PortPass admin",
  robots: { index: false, follow: false },
};

const STATUS = ["live", "draft", "ended"] as const;
const STATUS_LABEL = { live: "Live", draft: "Draft", ended: "Ended" } as const;

// Admin -> Perks (brief 10, 6.4): every perk and where it stands, how
// often each has been used, the businesses whose perks are used most, and
// sign-ups this week by where they came from. A perk that breaks the
// rules can be ended here, with a reason that is logged.
export default async function AdminPerksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireAdmin("/admin/perks");
  const { status } = await searchParams;
  const filter = STATUS.find((s) => s === status) ?? null;
  // eslint-disable-next-line react-hooks/purity -- a server component, rendered once per request
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [perks, stats] = await Promise.all([listAllPerks(), getPerkStats(since)]);
  const today = nassauToday();
  const shown = filter ? perks.filter((perk) => perk.status === filter) : perks;
  const liveToday = perks.filter((perk) => isPerkLive(perk, today)).length;

  const byBusiness = new Map<string, number>();
  for (const perk of perks) byBusiness.set(perk.businessName, (byBusiness.get(perk.businessName) ?? 0) + perk.redemptions);
  const top = [...byBusiness.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);

  return (
    <AdminShell session={session} current="/admin/perks" title="Member perks" lede="What businesses offer PortPass members. Each business funds and applies its own perk: PortPass never changes what a customer is charged." actions={<Link className="admin-bar-link" href="/perks">The public page</Link>}>
      <div className="admin-tiles">
        <div className="admin-tile"><strong>{liveToday}</strong><span>Perks running today</span><small>{liveToday < 3 ? "The homepage row shows from three" : "Shown on the homepage row"}</small></div>
        <div className="admin-tile"><strong>{stats.redemptions}</strong><span>Perks used, last 7 days</span></div>
        <Link className="admin-tile" href="/admin/people"><strong>{stats.signUps}</strong><span>Sign-ups, last 7 days</span><small>{stats.bySource.length === 0 ? "None yet" : stats.bySource.map((entry) => `${signupSourceLabel(entry.source)}: ${entry.count}`).join(" · ")}</small></Link>
      </div>

      {top.length > 0 && (
        <section className="admin-group" aria-labelledby="perks-top">
          <h2 id="perks-top">Businesses whose perks are used most</h2>
          <ol className="admin-plain-list">
            {top.map(([name, count]) => <li key={name}>{name}: {count} use{count === 1 ? "" : "s"}</li>)}
          </ol>
        </section>
      )}

      <div className="admin-filters" aria-label="Filter">
        <Link href="/admin/perks" aria-current={filter === null ? "true" : undefined}>All</Link>
        {STATUS.map((s) => <Link key={s} href={`/admin/perks?status=${s}`} aria-current={filter === s ? "true" : undefined}>{STATUS_LABEL[s]}</Link>)}
      </div>

      {shown.length === 0 ? (
        <p className="admin-empty">{perks.length === 0 ? "No business has added a perk yet." : "None with that status."}</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Business</th><th>Perk</th><th>Conditions</th><th>Status</th><th>Used</th><th>End it</th></tr></thead>
          <tbody>
            {shown.map((perk) => (
              <tr key={perk.id}>
                <td data-label="Business">{perk.businessName}</td>
                <td data-label="Perk"><span className="perk-chip">{perkChip(perk)}</span><br />{perk.title}</td>
                <td data-label="Conditions">{perkConditions(perk) || "None"}{perk.startsOn && perk.startsOn > today ? ` Starts ${shortDay(perk.startsOn)}.` : ""}</td>
                <td data-label="Status">{perk.status === "live" && !isPerkLive(perk, today) ? "Live, not running today" : STATUS_LABEL[perk.status]}</td>
                <td data-label="Used">{perk.redemptions}</td>
                <td data-label="End it">{perk.status === "ended" ? "—" : <EndPerk id={perk.id} title={perk.title} business={perk.businessName} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
