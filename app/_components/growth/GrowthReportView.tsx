import type { GrowthReport } from "@/db/growth";
import { formatCents, monthLabel, shortDate, type PeriodReport } from "@/lib/growth";

// The growth report (brief 05, part 2): found you, asked, booked, paid,
// showed up, and what PortPass brought. This term beside last term.
// Night theme, phone first, no client JavaScript.
//
// About children it shows a first name and a class in one list (missed two
// in a row) and nothing else: the data it is given holds no medical,
// allergy, emergency or contact details.

function Stat({ label, value, before, hint }: { label: string; value: string; before?: string | null; hint?: string }) {
  return (
    <div className="growth-stat">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {before !== undefined && before !== null && <small>Last term: {before}</small>}
        {hint && <small>{hint}</small>}
      </dd>
    </div>
  );
}

const n = (value: number | undefined | null) => (value === undefined || value === null ? null : String(value));

export function GrowthReportView({ report }: { report: GrowthReport }) {
  const term = report.current;
  const last: PeriodReport | null = report.previous;
  const value = report.value;
  const percent = value.terms.rateBps / 100;

  if (!term) {
    return (
      <div className="growth">
        <p className="growth-lead">No term is running or coming up yet. The report fills in once a class has a term.</p>
      </div>
    );
  }

  return (
    <div className="growth">
      <p className="growth-lead">
        <strong>{term.label}</strong> · {shortDate(term.start)} to {shortDate(term.end)}.{" "}
        {last ? `Compared with ${last.label}.` : "There is no earlier term to compare with yet."}
      </p>

      {report.unmarked.length > 0 && (
        <div className="growth-alert" role="status">
          <strong>Attendance not marked</strong>
          <ul>
            {report.unmarked.map((s) => <li key={`${s.date}-${s.programName}`}>{shortDate(s.date)} · {s.programName}</li>)}
          </ul>
        </div>
      )}

      <section className="growth-panel" aria-labelledby="growth-found">
        <h2 id="growth-found">Found you</h2>
        <dl className="growth-stats">
          <Stat label="Page views" value={String(term.found.views)} before={n(last?.found.views)} />
        </dl>
        {term.found.bySource.length > 0 ? (
          <ul className="growth-rows">
            {term.found.bySource.map((source) => (
              <li key={source.channel}><span>{source.label}</span><b>{source.views}</b></li>
            ))}
          </ul>
        ) : (
          <p className="growth-note">No views counted yet.</p>
        )}
        <p className="growth-note">Views and taps are counted from the day this report went live, and a term&rsquo;s count starts the day after the term before it ended. No names and no internet addresses are kept.</p>
      </section>

      <section className="growth-panel" aria-labelledby="growth-asked">
        <h2 id="growth-asked">Asked</h2>
        <dl className="growth-stats">
          <Stat label="WhatsApp taps" value={String(term.asked.whatsappTaps)} before={n(last?.asked.whatsappTaps)} />
          <Stat label="Register clicks" value={String(term.asked.registerClicks)} before={n(last?.asked.registerClicks)} />
          <Stat label="Private session requests" value={String(term.asked.privateRequests)} before={n(last?.asked.privateRequests)} />
        </dl>
      </section>

      <section className="growth-panel" aria-labelledby="growth-booked">
        <h2 id="growth-booked">Booked</h2>
        <dl className="growth-stats">
          <Stat label="Forms opened" value={String(term.booked.started)} before={n(last?.booked.started)} />
          <Stat label="Places taken" value={String(term.booked.completed)} before={n(last?.booked.completed)} />
          <Stat label="Children from new families" value={String(term.booked.newFamilyChildren)} before={n(last?.booked.newFamilyChildren)} />
          <Stat label="Children from returning families" value={String(term.booked.returningFamilyChildren)} before={n(last?.booked.returningFamilyChildren)} />
          <Stat label="On the waitlist" value={String(term.booked.waitlist)} />
          <Stat label="Free tasters" value={String(term.booked.tasters)} />
        </dl>
        {term.booked.classes.length > 0 && (
          <ul className="growth-rows">
            {term.booked.classes.map((c) => (
              <li key={c.programName}>
                <span>{c.programName}</span>
                <b>{c.registered} of {c.capacity} · {c.fillPercent}%</b>
                <i aria-hidden="true"><em style={{ width: `${Math.min(100, c.fillPercent)}%` }} /></i>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="growth-panel" aria-labelledby="growth-paid">
        <h2 id="growth-paid">Paid</h2>
        <dl className="growth-stats">
          <Stat label="Fees due" value={formatCents(term.paid.dueCents)} before={last ? formatCents(last.paid.dueCents) : null} />
          <Stat label="Collected" value={formatCents(term.paid.collectedCents)} before={last ? formatCents(last.paid.collectedCents) : null} />
          <Stat label="Outstanding" value={formatCents(term.paid.outstandingCents)} before={last ? formatCents(last.paid.outstandingCents) : null} />
        </dl>
        {term.paid.classes.length > 0 && (
          <ul className="growth-rows">
            {term.paid.classes.map((c) => (
              <li key={c.programName}><span>{c.programName}</span><b>{formatCents(c.collectedCents)} of {formatCents(c.dueCents)}</b></li>
            ))}
          </ul>
        )}
      </section>

      <section className="growth-panel" aria-labelledby="growth-showed">
        <h2 id="growth-showed">Showed up</h2>
        <dl className="growth-stats">
          <Stat
            label="Average attendance"
            value={term.showedUp.averagePercent === null ? "Not marked yet" : `${term.showedUp.averagePercent}%`}
            before={last ? (last.showedUp.averagePercent === null ? "not marked" : `${last.showedUp.averagePercent}%`) : null}
          />
        </dl>
        {term.showedUp.sessions.length > 0 && (
          <ul className="growth-rows">
            {term.showedUp.sessions.slice(0, 12).map((s) => (
              <li key={`${s.date}-${s.programName}`}>
                <span>{shortDate(s.date)} · {s.programName}</span>
                <b>{s.taken ? `${s.present} of ${s.enrolled}${s.percent === null ? "" : ` · ${s.percent}%`}` : "Not marked"}</b>
              </li>
            ))}
          </ul>
        )}
        <h3>Missed two in a row</h3>
        {report.missedTwo.length > 0 ? (
          <ul className="growth-rows">
            {report.missedTwo.map((m, i) => <li key={`${m.childFirstName}-${m.programName}-${i}`}><span>{m.childFirstName}</span><b>{m.programName}</b></li>)}
          </ul>
        ) : (
          <p className="growth-note">Nobody has missed the last two sessions. A child marked late counts as there.</p>
        )}
      </section>

      <section className="growth-panel" aria-labelledby="growth-value">
        <h2 id="growth-value">PortPass value</h2>
        <p className="growth-note">
          New families who came through a PortPass link, QR code, listing, perk or referral code, counted only on fees you have collected.
        </p>
        <dl className="growth-stats">
          <Stat label={`Families who paid in ${monthLabel(value.month)}`} value={String(value.thisMonth.families)} />
          <Stat label="Fees collected from them" value={formatCents(value.thisMonth.collectedCents)} />
          <Stat label={value.onPlan ? `PortPass fee (${percent}%)` : `What ${percent}% would be`} value={formatCents(value.thisMonth.feeCents)} />
          {value.term && (
            <Stat
              label={`${value.term.label} so far`}
              value={`${formatCents(value.term.feeCents)} of ${formatCents(value.term.capCents)}`}
              hint={value.term.capApplied ? `Cap reached: ${percent}% would have been ${formatCents(value.term.uncappedFeeCents)}.` : `The cap for the term is ${formatCents(value.term.capCents)}.`}
            />
          )}
          {value.onPlan && <Stat label="Invoiced so far" value={formatCents(value.invoicedCents)} />}
        </dl>
        {!value.onPlan && <p className="growth-note">You are not on the Grow With Us plan, so nothing is invoiced for this. It shows what the plan would come to.</p>}
      </section>
    </div>
  );
}
