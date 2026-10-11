import Link from "next/link";
import { loadOwnerDashboard } from "@/db/ownerDashboard";
import { filterMoney, isMoneyFilter, isMonth, MONEY_STATUS_LABEL, ratePercent, type MoneyFilter } from "@/lib/ownerDashboard";
import { money, monthLabel, nassauDate } from "@/lib/paymentRequests/rules";
import "./dashboard.css";

// The owner's dashboard (brief 27, B): four tiles, the money table and the
// attendance table, on the business home where owners and admins land
// after sign-in. Rendered on the server from the business's own rows; the
// filters are links, so there is no script and nothing to animate.
//
// `showMoney` is decided by the page from the person's role
// (lib/paymentRequests/access.ts handlesPayments): a coach sees attendance
// and the two session tiles only, and the money queries never run.

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const day = (iso: string) => DAY.format(new Date(`${iso}T12:00:00Z`));

const STATUS_FILTERS: { value: MoneyFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
];

export async function OwnerDashboard({ orgId, basePath, showMoney, query }: { orgId: number; basePath: string; showMoney: boolean; query: { month?: string; status?: string } }) {
  let data: Awaited<ReturnType<typeof loadOwnerDashboard>>;
  try {
    data = await loadOwnerDashboard(orgId, { money: showMoney });
  } catch (error) {
    console.error("owner dashboard", error instanceof Error ? error.message : "");
    return <p className="dash-note">The money and attendance summary couldn&rsquo;t load just now. Refresh in a moment.</p>;
  }
  const { tiles, today } = data;
  const status: MoneyFilter = isMoneyFilter(query.status) ? query.status : "all";
  // This month by default; "all" shows every month, so an older request
  // still owed is never hidden from the table while the tile counts it.
  const month: string | null = query.month === "all" ? null : isMonth(query.month) ? query.month : today.slice(0, 7);
  const href = (next: { month?: string; status?: MoneyFilter }) => `${basePath}?month=${next.month ?? month ?? "all"}&status=${next.status ?? status}#money`;
  const shownMoney = data.money ? filterMoney(data.money.rows, month, status) : [];
  const csvQuery = `month=${encodeURIComponent(month ?? "all")}&status=${status}`;

  return (
    <div className="dash">
      <dl className="dash-tiles" aria-label="This month at a glance">
        {data.money && <div><dt>Collected this month</dt><dd>{money(tiles.collectedThisMonthCents)}<small>Payment requests marked paid in {monthLabel(today.slice(0, 7))}</small></dd></div>}
        {data.money && <div><dt>Still owed</dt><dd>{money(tiles.owedCents)}<small>{tiles.owedCount === 0 ? "Nothing pending or overdue" : `${tiles.owedCount} ${tiles.owedCount === 1 ? "request" : "requests"} pending or overdue`}</small></dd></div>}
        <div>
          <dt>{tiles.nextSessionDay && tiles.nextSessionDay.date === today ? "Booked today" : tiles.nextSessionDay && day(tiles.nextSessionDay.date).startsWith("Sat") ? "Booked this Saturday" : "Booked next session day"}</dt>
          <dd>{tiles.nextSessionDay ? tiles.nextSessionDay.booked : "—"}<small>{tiles.nextSessionDay ? `${day(tiles.nextSessionDay.date)} · ${tiles.nextSessionDay.sessions} ${tiles.nextSessionDay.sessions === 1 ? "session" : "sessions"}` : "No session in the next week"}</small></dd>
        </div>
        <div><dt>Private sessions this week</dt><dd>{tiles.privateThisWeek.accepted + tiles.privateThisWeek.pending}<small>{tiles.privateThisWeek.accepted} accepted · {tiles.privateThisWeek.pending} waiting for a reply</small></dd></div>
      </dl>

      {data.money && (
        <section id="money" aria-labelledby="dash-money-h">
          <div className="dash-head">
            <h2 id="dash-money-h">Money</h2>
            <p>Every payment request. Customers pay you directly; PortPass never holds the money.</p>
          </div>
          <div className="dash-filters" aria-label="Month">
            <span>Month</span>
            {data.money.months.slice(0, 6).map((m) => <Link key={m} href={href({ month: m })} aria-current={m === month ? "true" : undefined}>{monthLabel(m)}</Link>)}
            <Link href={href({ month: "all" })} aria-current={month === null ? "true" : undefined}>All months</Link>
          </div>
          <div className="dash-filters" aria-label="Status">
            <span>Show</span>
            {STATUS_FILTERS.map((f) => <Link key={f.value} href={href({ status: f.value })} aria-current={f.value === status ? "true" : undefined}>{f.label}</Link>)}
            <a className="dash-csv" href={`/api/business/orgs/${orgId}/money-csv?${csvQuery}`}>Download CSV</a>
          </div>
          {shownMoney.length === 0 ? (
            <p className="dash-empty">No payment requests {status === "all" ? "" : `${MONEY_STATUS_LABEL[status].toLowerCase()} `}{month ? `in ${monthLabel(month)}` : "yet"}.</p>
          ) : (
            <div className="dash-scroll">
              <table className="dash-table">
                <thead><tr><th>Person</th><th className="is-text">For</th><th>Amount</th><th>Reference</th><th>Status</th><th>Method</th><th>Date paid</th></tr></thead>
                <tbody>
                  {shownMoney.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`${basePath}/payments/${r.id}`}>{r.person}</Link></td>
                      <td className="is-text">{r.what}</td>
                      <td>{money(r.amountCents)}{r.status === "pending" || r.status === "overdue" ? r.balanceCents !== r.amountCents && <small> · {money(r.balanceCents)} left</small> : null}</td>
                      <td>{r.referenceCode}</td>
                      <td><span className={`dash-pill is-${r.status}`}>{MONEY_STATUS_LABEL[r.status]}</span></td>
                      <td>{r.method ?? "—"}</td>
                      <td>{r.paidAt ? nassauDate(r.paidAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section id="attendance" aria-labelledby="dash-att-h">
        <div className="dash-head">
          <h2 id="dash-att-h">Attendance</h2>
          <p>The last eight weeks and the week ahead. Names and marks only.</p>
        </div>
        <div className="dash-filters">
          <Link className="dash-csv" href={`${basePath}/attendance`}>Mark attendance</Link>
          <a className="dash-csv" href={`/api/business/orgs/${orgId}/attendance-csv`}>Download CSV</a>
        </div>
        {data.sessions.length === 0 ? (
          <p className="dash-empty">No sessions in this period.</p>
        ) : (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>Session</th><th>Booked</th><th>Present</th><th>Absent</th><th>Not marked</th></tr></thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={`${s.kind}:${s.id}`}>
                    <td>
                      {s.kind === "class" ? <Link href={`${basePath}/attendance?session=${s.id}`}>{s.name}</Link> : <>Private · {s.name}</>}
                      <br /><small>{day(s.date)}{s.startTime ? ` · ${s.startTime}` : ""}{s.location ? ` · ${s.location}` : ""}</small>
                    </td>
                    <td>{s.booked}</td><td>{s.present}</td><td>{s.absent}</td><td>{s.notMarked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.rates.length > 0 && (
          <div className="dash-scroll">
            <table className="dash-table" aria-label="Attendance by child">
              <thead><tr><th>Child</th><th className="is-text">Class</th><th>Held</th><th>Came</th><th>Rate</th></tr></thead>
              <tbody>
                {data.rates.map((r) => (
                  <tr key={r.registrationId}><td>{r.name}</td><td className="is-text">{r.programName}</td><td>{r.held}</td><td>{r.present}</td><td><span className="dash-rate">{ratePercent(r.rate)}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
