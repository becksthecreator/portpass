import Link from "next/link";
import { listSections } from "@/db/categories";
import { eventSignupCounts, getLeadsFunnel, leadsDigest, listLeads, lookupUsage, PLACES_DAILY_CAP, type EventSignupCount } from "@/db/leads";
import { requireAdmin } from "@/lib/auth/admin";
import { cleanEventCode, eventName } from "@/lib/eventSignup";
import { enrichmentConfigured } from "@/lib/scout/enrich";
import { instagramConfigured } from "@/lib/scout/instagram";
import { isLeadSource, isLeadStatus, LEAD_BOARD, LEAD_SOURCE_LABEL, LEAD_SOURCES, LEAD_STATUS_LABEL, LEAD_STATUSES, SCORE_ACTION_LABEL, scoreAction, type LeadSource, type LeadStatus } from "@/lib/scout/leads";
import { placesConfigured } from "@/lib/scout/places";
import { AdminShell } from "../_components/AdminShell";
import { AddLead } from "./AddLead";
import { PlacesSearch } from "./PlacesSearch";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads | PortPass admin",
  robots: { index: false, follow: false },
};

function when(iso: string | null): string {
  return iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-BS", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";
}

// A column shows its top leads; the heading keeps the full count.
const BOARD_COLUMN_MAX = 25;

const percent = (rate: number | null): string => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// PortPass Scout (brief 14): the lead catalogue. Business-published details
// only, from official sources and what the founders type. Messages are
// always sent by a founder, by hand, one at a time.
export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<{ section?: string; status?: string; source?: string; score?: string; area?: string; q?: string; view?: string; event?: string }> }) {
  const session = await requireAdmin("/admin/leads");
  const params = await searchParams;
  const status: LeadStatus | "all" | null = params.status === "all" ? "all" : isLeadStatus(params.status) && params.status !== "do_not_contact" ? params.status : null;
  const source: LeadSource | null = isLeadSource(params.source) ? params.source : null;
  const minScore = params.score && /^\d{1,3}$/.test(params.score) ? Number(params.score) : null;
  // Sign-ups at one event (/own, /join/<event>): brief 18, C3.
  const event = cleanEventCode(params.event);
  const board = params.view === "board";
  const filtered = Boolean(params.section || status || source || minScore !== null || params.area || params.q || event);
  // The whole catalogue is read once: the digest and the funnel count it,
  // and with no filter it is also the list shown.
  const now = new Date();
  const [sections, all, usage, events] = await Promise.all([
    listSections({ includeHidden: true }),
    listLeads(),
    lookupUsage(),
    // The chips are an extra: if the count fails, the catalogue still opens.
    eventSignupCounts().catch((error): EventSignupCount[] => {
      console.error("admin leads: event sign-ups", error instanceof Error ? error.message : error);
      return [];
    }),
  ]);
  const [leads, digest, funnel] = await Promise.all([
    filtered ? listLeads({ section: params.section || null, status, source, minScore, area: params.area ?? null, q: params.q ?? null, event }) : Promise.resolve(all),
    leadsDigest(now, all),
    getLeadsFunnel(now, all),
  ]);
  // The same filters, in the other view.
  const viewHref = (view: "table" | "board") => {
    const query = new URLSearchParams();
    for (const key of ["section", "status", "source", "score", "area", "q"] as const) if (params[key]) query.set(key, String(params[key]));
    if (event) query.set("event", event);
    if (view === "board") query.set("view", "board");
    const text = query.toString();
    return text ? `/admin/leads?${text}` : "/admin/leads";
  };
  const sectionName = (slug: string | null) => sections.find((s) => s.slug === slug)?.name ?? slug ?? "No section yet";
  const sectionOptions = sections.map((s) => ({ slug: s.slug, name: s.name, subcategories: s.subcategories.map((c) => ({ slug: c.slug, name: c.name })) }));

  return (
    <AdminShell
      session={session}
      current="/admin/leads"
      title="Leads"
      lede="Businesses that could be on PortPass Bahamas. Only what a business publishes about itself. You send every message yourself, one to one."
      actions={<><Link className="admin-bar-link" href="/admin/leads/sponsors">Sponsors</Link><Link className="admin-bar-link" href="/admin/leads/import">Import the Prospect Tracker</Link></>}
    >
      <section className="leads-digest" aria-labelledby="leads-digest-h">
        <h2 id="leads-digest-h">This week</h2>
        <div className="admin-tiles">
          <div className="admin-tile"><span>New leads (7 days)</span><strong>{digest.newThisWeek}</strong><small>{digest.newBySection.length ? digest.newBySection.map((s) => `${sectionName(s.section)} ${s.count}`).join(" · ") : "None added this week"}</small></div>
          <div className="admin-tile"><span>Replies waiting</span><strong>{digest.repliesWaiting.length}</strong><small>{digest.repliesWaiting.slice(0, 3).map((l) => l.businessName).join(" · ") || "Nothing waiting on you"}</small></div>
          <div className="admin-tile"><span>In the catalogue</span><strong>{digest.total}</strong><small>&ldquo;Do not contact&rdquo; businesses are never listed</small></div>
          <div className="admin-tile"><span>Google searches today</span><strong>{usage.placesToday} / {PLACES_DAILY_CAP}</strong><small>About {dollars(usage.monthCostCents.google_places)} this month · {usage.monthCount.claude} AI calls · {usage.monthCount.instagram} Instagram lookups</small></div>
        </div>
        <h3 className="leads-funnel-h">The funnel</h3>
        <table className="admin-table leads-funnel">
          <thead><tr><th>When</th><th>Added</th><th>Contacted</th><th>Replied</th><th>Live</th><th>Reply rate</th><th>Close rate</th></tr></thead>
          <tbody>
            <tr>
              <td data-label="When">Last 7 days</td>
              <td data-label="Added">{funnel.week.added}</td>
              <td data-label="Contacted">{funnel.week.contacted}</td>
              <td data-label="Replied">{funnel.week.replied}</td>
              <td data-label="Live">{funnel.week.live}</td>
              <td data-label="Reply rate">—</td>
              <td data-label="Close rate">—</td>
            </tr>
            <tr>
              <td data-label="When">All time</td>
              <td data-label="Added">{funnel.allTime.added}</td>
              <td data-label="Contacted">{funnel.allTime.contacted}</td>
              <td data-label="Replied">{funnel.allTime.replied}</td>
              <td data-label="Live">{funnel.allTime.live}</td>
              <td data-label="Reply rate">{percent(funnel.replyRate)}</td>
              <td data-label="Close rate">{percent(funnel.closeRate)}</td>
            </tr>
          </tbody>
        </table>
        {digest.topUncontacted.length > 0 && (
          <div className="leads-top">
            <h3>Top {digest.topUncontacted.length} by score, not yet contacted</h3>
            <ol>
              {digest.topUncontacted.map((lead) => (
                <li key={lead.id}><Link href={`/admin/leads/${lead.id}`}>{lead.businessName}</Link> <span className="lead-score">{lead.score}</span> <small>{sectionName(lead.section)}</small></li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <div className="leads-tools">
        <AddLead sections={sectionOptions} />
        <PlacesSearch configured={placesConfigured()} searchesLeft={usage.placesLeftToday} />
      </div>
      {(!enrichmentConfigured() || !instagramConfigured()) && (
        <p className="admin-prices-note">
          {!enrichmentConfigured() && "The AI step (section, score, first message) is off until ANTHROPIC_API_KEY is set. "}
          {!instagramConfigured() && "Instagram Business Discovery is off until INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_GRAPH_ACCESS_TOKEN are set."}
        </p>
      )}

      {(events.length > 0 || event) && (
        <div className="admin-filters leads-events" aria-label="Signed up at an event">
          <Link href={board ? "/admin/leads?view=board" : "/admin/leads"} aria-current={!event ? "true" : undefined}>Everyone</Link>
          {events.map((entry) => (
            <Link key={entry.event} href={`/admin/leads?event=${entry.event}${board ? "&view=board" : ""}`} aria-current={event === entry.event ? "true" : undefined}>
              Signed up at {eventName(entry.event)} ({entry.count})
            </Link>
          ))}
          {event && !events.some((entry) => entry.event === event) && <Link href={`/admin/leads?event=${event}`} aria-current="true">Signed up at {eventName(event)} (0)</Link>}
        </div>
      )}

      <form className="leads-filter" method="get" action="/admin/leads">
        <label><span>Section</span>
          <select name="section" defaultValue={params.section ?? ""}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
        <label><span>Area</span><input name="area" defaultValue={params.area ?? ""} placeholder="Cable Beach" maxLength={60} /></label>
        <label><span>Score at least</span>
          <select name="score" defaultValue={params.score ?? ""}>
            <option value="">Any score</option>
            <option value="70">70+ (call this week)</option>
            <option value="40">40+ (message)</option>
          </select>
        </label>
        <label><span>Status</span>
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">All open statuses</option>
            {LEAD_STATUSES.filter((s) => s !== "do_not_contact").map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label><span>Source</span>
          <select name="source" defaultValue={params.source ?? ""}>
            <option value="">Any source</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Business name" maxLength={60} /></label>
        {board && <input type="hidden" name="view" value="board" />}
        {event && <input type="hidden" name="event" value={event} />}
        <div className="leads-filter-actions">
          <button className="primary-button" type="submit">Filter</button>
          {filtered && <Link href={board ? "/admin/leads?view=board" : "/admin/leads"}>Clear</Link>}
        </div>
      </form>

      <div className="admin-filters" aria-label="View">
        <Link href={viewHref("table")} aria-current={!board ? "true" : undefined}>Table</Link>
        <Link href={viewHref("board")} aria-current={board ? "true" : undefined}>Board</Link>
      </div>

      {leads.length === 0 ? (
        <p className="admin-empty">{filtered ? "No leads match those filters." : "No leads yet. Add one, search Google Places, or import the Prospect Tracker."}</p>
      ) : board ? (
        <div className="leads-board">
          {LEAD_BOARD.map((column) => {
            const cards = leads.filter((lead) => lead.status === column);
            return (
              <section key={column} className="leads-board-column" aria-labelledby={`board-${column}`}>
                <h3 id={`board-${column}`}>{LEAD_STATUS_LABEL[column]} <span>{cards.length}</span></h3>
                {cards.length === 0 ? (
                  <p className="leads-board-empty">None</p>
                ) : (
                  <ul>
                    {cards.slice(0, BOARD_COLUMN_MAX).map((lead) => (
                      <li key={lead.id}>
                        <Link href={`/admin/leads/${lead.id}`}>{lead.businessName}</Link>
                        <small>{[sectionName(lead.section), lead.nextStep].filter(Boolean).join(" · ")}</small>
                        {lead.score !== null && <span className={`lead-score lead-score-${scoreAction(lead.score)}`}>{lead.score}</span>}
                      </li>
                    ))}
                    {cards.length > BOARD_COLUMN_MAX && <li className="leads-board-more"><Link href={`/admin/leads?status=${column}`}>See all {cards.length} in the table</Link></li>}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <table className="admin-table leads-table">
          <thead><tr><th>Business</th><th>Section</th><th>Area</th><th>Score</th><th>Status</th><th>Source</th><th>Last contact</th></tr></thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td data-label="Business"><Link href={`/admin/leads/${lead.id}`}><strong>{lead.businessName}</strong></Link>{lead.whatTheyDo ? <><br /><small>{lead.whatTheyDo.slice(0, 90)}</small></> : null}{lead.contactName ? <><br /><small>{lead.contactName}{lead.whatsappConsent ? " · WhatsApp OK" : " · no WhatsApp tick"}</small></> : null}</td>
                <td data-label="Section">{sectionName(lead.section)}</td>
                <td data-label="Area">{[lead.area, lead.island].filter(Boolean).join(", ") || "—"}</td>
                <td data-label="Score">{lead.score === null ? "—" : <><span className={`lead-score lead-score-${scoreAction(lead.score)}`}>{lead.score}</span> <small>{SCORE_ACTION_LABEL[scoreAction(lead.score)]}</small></>}</td>
                <td data-label="Status"><span className={`admin-pill lead-status-${lead.status}`}>{LEAD_STATUS_LABEL[lead.status]}</span></td>
                <td data-label="Source">{lead.eventCode ? `Signed up at ${eventName(lead.eventCode)}` : LEAD_SOURCE_LABEL[lead.source]}</td>
                <td data-label="Last contact">{when(lead.lastContactOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
