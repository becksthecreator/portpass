"use client";

import { useState } from "react";
import type { PayCoach } from "@/db/coachPay";
import { monthLabel, type PaySummary, type PnlLine } from "@/lib/coachPay";

function money(cents: number) {
  return new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
}

function dollarsField(cents: number | null) {
  return cents === null ? "" : String(cents / 100);
}

function toCents(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

export function CoachPayManager({
  canManage,
  summaries: initialSummaries,
  coaches,
  logins,
  pnl,
}: {
  canManage: boolean;
  summaries: PaySummary[];
  coaches: PayCoach[];
  logins: Array<{ id: number; name: string }>;
  pnl: PnlLine[];
}) {
  const [summaries, setSummaries] = useState(initialSummaries);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [rates, setRates] = useState(() =>
    Object.fromEntries(coaches.map((c) => [c.id, { lead: dollarsField(c.defaultLeadPayCents), assistant: dollarsField(c.defaultAssistantPayCents), login: c.staffMemberId ? String(c.staffMemberId) : "" }])),
  );

  async function markPaid(summary: PaySummary) {
    const key = `${summary.coachId}:${summary.month}`;
    setBusy(key);
    setNotice("");
    const response = await fetch("/api/futprep/staff/pay/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coachId: summary.coachId, month: summary.month }) }).catch(() => null);
    setBusy(null);
    if (!response || !response.ok) return setNotice("Couldn't mark it paid. Try again.");
    setSummaries((current) => current.map((s) => (s.coachId === summary.coachId && s.month === summary.month ? { ...s, paidCents: s.paidCents + s.owedCents, owedCents: 0 } : s)));
    setNotice(`${summary.coachName}: ${monthLabel(summary.month)} marked paid.`);
  }

  // Field hire per term (the Money Model's "ask Alex" box), per program.
  const [pnlLines, setPnlLines] = useState(pnl);
  const [fieldInputs, setFieldInputs] = useState<Record<number, string>>(() =>
    Object.fromEntries(pnl.map((line) => [line.programId, line.fieldCostCents ? dollarsField(line.fieldCostCents) : ""])),
  );

  async function saveField(line: PnlLine) {
    const cents = toCents(fieldInputs[line.programId] ?? "");
    if (Number.isNaN(cents)) return setNotice("Enter the field cost in dollars, or leave it blank.");
    setBusy(`field:${line.programId}`);
    setNotice("");
    const response = await fetch("/api/futprep/staff/pay/field-cost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: line.programId, cents }),
    }).catch(() => null);
    setBusy(null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    if (!response || !response.ok) return setNotice(data.error ?? "Couldn't save the field cost.");
    const field = cents ?? 0;
    setPnlLines((current) => current.map((l) => (l.programId === line.programId ? { ...l, fieldCostCents: field, leftCents: l.feesCollectedCents - l.coachPayCents - field - l.portpassFeeCents } : l)));
    setNotice(`${line.programName}: field cost saved.`);
  }

  async function saveRates(coach: PayCoach) {
    const entry = rates[coach.id];
    const leadCents = toCents(entry.lead);
    const assistantCents = toCents(entry.assistant);
    if (Number.isNaN(leadCents) || Number.isNaN(assistantCents)) return setNotice("Enter pay as dollars, or leave it blank.");
    setBusy(`rates:${coach.id}`);
    setNotice("");
    const response = await fetch("/api/futprep/staff/pay/rates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId: coach.id, leadCents, assistantCents, staffMemberId: entry.login ? Number(entry.login) : null }),
    }).catch(() => null);
    setBusy(null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    if (!response || !response.ok) return setNotice(data.error ?? "Couldn't save the rates.");
    setNotice(`${coach.name}: rates saved. New sessions use them; recorded sessions keep their pay.`);
  }

  return (
    <div className="pay-manager">
      {notice && <p className="coach-manager-message" role="status">{notice}</p>}

      <section className="pay-section" aria-labelledby="pay-by-month">
        <div className="pay-section-head">
          <h2 id="pay-by-month">By month</h2>
          <a className="secondary-button" href="/api/futprep/staff/pay/csv">Download CSV ↓</a>
        </div>
        {summaries.length === 0 && <div className="dashboard-empty"><h3>No sessions recorded yet.</h3><p>Coaches are recorded under &ldquo;Coaches today&rdquo; on each session&apos;s roster.</p></div>}
        <div className="pay-cards">
          {summaries.map((s) => (
            <article className="pay-card" key={`${s.coachId}:${s.month}`}>
              <div className="pay-card-head"><strong>{s.coachName}</strong><span>{monthLabel(s.month)}</span></div>
              <dl>
                <div><dt>Sessions</dt><dd>{s.sessions}</dd></div>
                <div><dt>Owed</dt><dd className={s.owedCents > 0 ? "is-owed" : ""}>{money(s.owedCents)}</dd></div>
                <div><dt>Paid</dt><dd>{money(s.paidCents)}</dd></div>
              </dl>
              {canManage && s.owedCents > 0 && (
                <button type="button" disabled={busy === `${s.coachId}:${s.month}`} onClick={() => markPaid(s)}>Mark paid</button>
              )}
            </article>
          ))}
        </div>
      </section>

      {canManage && (
        <section className="pay-section" aria-labelledby="pay-rates">
          <div className="pay-section-head"><h2 id="pay-rates">Pay per class</h2></div>
          <p className="pay-note">What each coach is owed for a session they lead or assist. Blank means not set yet (a session is recorded at $0 until it is). Linking a staff login lets that coach see their own pay.</p>
          <div className="pay-cards">
            {coaches.map((coach) => (
              <article className="pay-card" key={coach.id}>
                <div className="pay-card-head"><strong>{coach.name}</strong>{!coach.active && <span>profile hidden</span>}</div>
                <div className="pay-rate-fields">
                  <label><span>Lead ($)</span><input inputMode="decimal" value={rates[coach.id]?.lead ?? ""} onChange={(e) => setRates((r) => ({ ...r, [coach.id]: { ...r[coach.id], lead: e.target.value } }))} /></label>
                  <label><span>Assistant ($)</span><input inputMode="decimal" value={rates[coach.id]?.assistant ?? ""} onChange={(e) => setRates((r) => ({ ...r, [coach.id]: { ...r[coach.id], assistant: e.target.value } }))} /></label>
                  <label className="pay-rate-login"><span>Staff login</span>
                    <select value={rates[coach.id]?.login ?? ""} onChange={(e) => setRates((r) => ({ ...r, [coach.id]: { ...r[coach.id], login: e.target.value } }))}>
                      <option value="">Not linked</option>
                      {logins.map((login) => <option key={login.id} value={login.id}>{login.name}</option>)}
                    </select>
                  </label>
                </div>
                <button type="button" disabled={busy === `rates:${coach.id}`} onClick={() => saveRates(coach)}>Save</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <section className="pay-section" aria-labelledby="pay-pnl">
          <div className="pay-section-head"><h2 id="pay-pnl">Program P&amp;L</h2></div>
          <p className="pay-note">Per program and term, as on the Money Model: fees collected, minus coach pay, the field and the PortPass fee (8% of fees from families PortPass brought in, never more than $360 a term).</p>
          {pnlLines.length === 0 && <div className="dashboard-empty"><h3>Nothing collected or coached yet.</h3></div>}
          <div className="pay-cards">
            {pnlLines.map((line) => (
              <article className="pay-card" key={`${line.programName}:${line.termName}`}>
                <div className="pay-card-head"><strong>{line.programName}</strong><span>{line.termName}{line.kind === "contract" ? " · school contract" : ""}</span></div>
                <dl>
                  <div><dt>{line.kind === "contract" ? "To invoice" : "Fees collected"}</dt><dd>{money(line.feesCollectedCents)}</dd></div>
                  <div><dt>Coach pay</dt><dd>−{money(line.coachPayCents)}</dd></div>
                  <div><dt>Field</dt><dd>−{money(line.fieldCostCents)}</dd></div>
                  <div><dt>PortPass fee</dt><dd>−{money(line.portpassFeeCents)}</dd></div>
                  <div className="pay-left"><dt>Left for Futprep</dt><dd>{money(line.leftCents)}</dd></div>
                </dl>
                <div className="pay-field-edit">
                  <label><span>Field hire per term ($)</span>
                    <input inputMode="decimal" placeholder="Not set" value={fieldInputs[line.programId] ?? ""} onChange={(e) => setFieldInputs((f) => ({ ...f, [line.programId]: e.target.value }))} />
                  </label>
                  <button type="button" disabled={busy === `field:${line.programId}`} onClick={() => saveField(line)}>Save</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
