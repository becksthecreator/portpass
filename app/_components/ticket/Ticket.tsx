import type { ReactNode } from "react";
import "./ticket.css";

// The ticket-office kit from the Instagram ads (Site Design, "First Look
// pages", 24 Nov): a ticket with a stub, an ink stamp, a scorecard and a
// departure board. Harbour Signal tokens only, the site's own fonts.
// Everything is still at rest; the stamp's thud is CSS and off under
// reduced motion.

export type StampTone = "signal" | "ink" | "ok" | "strong";

export function Stamp({ children, tone = "signal" }: { children: ReactNode; tone?: StampTone }) {
  return <span className={`tk-stamp tk-stamp-${tone}`}>{children}</span>;
}

export function Ticket({
  top,
  topRight,
  title,
  line,
  stubLabel,
  stubValue,
  stubFoot,
  stamp,
  stampTone,
  stripe = "signal",
  children,
}: {
  top: string;
  topRight?: string;
  title: string;
  line?: ReactNode;
  stubLabel: string;
  stubValue: string;
  stubFoot?: string;
  stamp?: string;
  stampTone?: StampTone;
  stripe?: "signal" | "ink";
  children?: ReactNode;
}) {
  return (
    <div className={`tk${stamp ? " tk-has-stamp" : ""}`}>
      <div className={`tk-main tk-stripe-${stripe}`}>
        <p className="tk-top"><span>{top}</span>{topRight && <span>{topRight}</span>}</p>
        <p className="tk-title">{title}</p>
        {line && <p className="tk-line">{line}</p>}
        {children}
      </div>
      <div className="tk-stub" aria-hidden="true">
        <small>{stubLabel}</small>
        <b>{stubValue}</b>
        {stubFoot && <small>{stubFoot}</small>}
      </div>
      {stamp && <Stamp tone={stampTone}>{stamp}</Stamp>}
    </div>
  );
}

export type ScoreRow = { name: string; detail: string; mark: string; tone: StampTone };

// An example scorecard: the rows a First Look scores, with example marks.
export function Scorecard({ rows, foot }: { rows: ScoreRow[]; foot: string }) {
  return (
    <section className="tk-score" aria-labelledby="tk-score-h">
      <h2 id="tk-score-h">A one-page <span>scorecard.</span></h2>
      <ol>
        {rows.map((row, i) => (
          <li key={row.name}>
            <i aria-hidden="true">{String(i + 1).padStart(2, "0")}</i>
            <span><b>{row.name}</b><span>{row.detail}</span></span>
            <Stamp tone={row.tone}>{row.mark}</Stamp>
          </li>
        ))}
      </ol>
      <p className="tk-score-foot">{foot}</p>
    </section>
  );
}

// A departure board of kinds of business. "Boarding" means we're taking
// that kind of business now, not that one is already live.
export function Board({ rows, label }: { rows: { name: string; status: string }[]; label: string }) {
  return (
    <div className="tk-board" role="group" aria-label={label}>
      <div className="tk-board-head" aria-hidden="true"><span>Business</span><span>Status</span></div>
      <ul>
        {rows.map((row) => (
          <li key={row.name}><b>{row.name}</b><small>{row.status}</small></li>
        ))}
      </ul>
    </div>
  );
}
