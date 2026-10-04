"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  balanceCents,
  daysOverdue,
  displayStatus,
  filterRequests,
  formatDay,
  linesSummary,
  money,
  needsChecking,
  statusLabel,
  type ListedRequest,
  type RequestFilter,
} from "@/lib/paymentRequests/rules";

const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: "outstanding", label: "Outstanding" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "check", label: "To check" },
  { value: "all", label: "All" },
];

// Payments -> Requests: filters, search by customer or reference, and the
// accountant's CSV for a date range.
export function RequestsBoard({ rows, basePath, apiBase, today, initialFilter, demo = false }: { rows: ListedRequest[]; basePath: string; apiBase: string; today: string; initialFilter: RequestFilter; demo?: boolean }) {
  const [filter, setFilter] = useState<RequestFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const shown = useMemo(() => filterRequests(rows, filter, search, today), [rows, filter, search, today]);
  const exportHref = (kind: "requests" | "payments") => `${apiBase}/export?kind=${kind}&from=${from}&to=${to}`;

  return (
    <>
      <div className="preq-filters">
        <div className="preq-segments" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>
          ))}
        </div>
        <label className="preq-search">
          <span>Search</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, phone, email or FP-0042" autoComplete="off" />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="preq-empty">No requests yet. {demo ? <Link className="preq-link" href="/demo/registrations">Start from a registration →</Link> : <Link className="preq-link" href={`${basePath}/new`}>Send the first one →</Link>}</p>
      ) : shown.length === 0 ? (
        <p className="preq-empty">Nothing here{search ? ` for “${search}”` : ""}.</p>
      ) : (
        <ul className="preq-list" aria-label="Requests">
          {shown.map((r) => {
            const status = displayStatus(r, today);
            const owing = balanceCents(r);
            const when =
              status === "paid" ? "Paid in full"
              : status === "void" ? "Void"
              : status === "overdue" ? `${daysOverdue(r.dueDate, today)} ${daysOverdue(r.dueDate, today) === 1 ? "day" : "days"} overdue`
              : status === "draft" ? "Not sent yet"
              : `Due ${formatDay(r.dueDate, today)}`;
            return (
              <li key={r.id}>
                <Link className={`preq-row${status === "overdue" ? " is-overdue" : ""}`} href={`${basePath}/${r.id}`}>
                  <span className="preq-row-main">
                    <span className="preq-ref">{r.referenceCode}{r.isTest ? " · TEST" : ""}</span>
                    <strong>{r.customerName}</strong>
                    <span>{linesSummary(r.lines)}</span>
                  </span>
                  <span className="preq-row-side">
                    <b>{money(status === "paid" || status === "void" ? r.totalCents : owing)}</b>
                    <span className={`preq-pill is-${status}`}>{statusLabel(status)}</span>
                    {needsChecking(r) && <span className="preq-flag">Check and confirm</span>}
                    <small>{when}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* The accountant's export is a real business's records: not in the demo. */}
      {!demo && <details className="preq-export">
        <summary>Export for your accountant</summary>
        <div className="preq-export-body">
          <label>From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} min={from} max={addDays(today, 366)} onChange={(e) => setTo(e.target.value)} /></label>
          <a className="preq-btn is-small" href={exportHref("requests")} download>Requests (CSV)</a>
          <a className="preq-btn is-small" href={exportHref("payments")} download>Payments (CSV)</a>
        </div>
      </details>}
    </>
  );
}
