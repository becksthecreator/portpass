"use client";

import { FormEvent, useState } from "react";

type StatusResult = {
  referenceCode: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship: string;
  program: { name: string; day: string; time: string; endTime: string; location: string };
  paymentFrequency: "weekly" | "term";
  paymentMethod: "cash" | "bank_transfer" | "online_banking";
  amountDueCents: number;
  paidCents: number;
  paymentStatus: "pending" | "partial" | "paid" | "overdue" | "waived";
  registrationStatus: "pending" | "confirmed" | "cancelled";
  remainingSessionDates: string[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0 }).format(cents / 100);
}

function paymentMethodLabel(method: string) {
  if (method === "cash") return "Cash";
  if (method === "online_banking") return "Online banking transfer";
  return "Bank transfer";
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en-BS", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function LookupForm({ initialCode = "" }: { initialCode?: string }) {
  const [referenceCode, setReferenceCode] = useState(initialCode);
  const [childDob, setChildDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/futprep/registrations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceCode, childDob }),
      });
      const data = (await response.json()) as { status?: StatusResult; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error ?? "Lookup failed.");
      setResult(data.status);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const balanceCents = Math.max(0, result.amountDueCents - result.paidCents);
    return (
      <section className="my-status-card">
        <span className={`status status-${result.paymentStatus}`}>{result.registrationStatus === "cancelled" ? "Cancelled" : result.paymentStatus}</span>
        <h1>{result.childName}</h1>
        <p className="my-status-reference">Registration code <strong>{result.referenceCode}</strong></p>

        <dl className="my-status-grid">
          <div><dt>Class</dt><dd>{result.program.name}</dd></div>
          <div><dt>Time</dt><dd>{result.program.day} · {result.program.time}–{result.program.endTime}</dd></div>
          <div><dt>Location</dt><dd>{result.program.location}</dd></div>
          <div><dt>Plan</dt><dd>{result.paymentFrequency === "term" ? "Full term" : "Weekly"}</dd></div>
          <div><dt>Amount due</dt><dd>{money(result.amountDueCents)}</dd></div>
          <div><dt>Recorded</dt><dd>{money(result.paidCents)}</dd></div>
        </dl>

        {balanceCents > 0 && result.registrationStatus !== "cancelled" && (
          <div className="my-status-balance">
            <span>Balance remaining</span>
            <strong>{money(balanceCents)}</strong>
            <p>Pay by {paymentMethodLabel(result.paymentMethod)}, using <strong>{result.referenceCode}</strong> as the reference.</p>
          </div>
        )}

        {result.remainingSessionDates.length > 0 && (
          <div className="my-status-sessions">
            <span className="choice-heading">Remaining sessions</span>
            <ul>{result.remainingSessionDates.map((date) => <li key={date}>{readableDate(date)}</li>)}</ul>
          </div>
        )}

        <a
          className="secondary-button"
          href={`/futprep/lil-kickers/register?${new URLSearchParams({
            parentName: result.parentName,
            parentEmail: result.parentEmail,
            parentPhone: result.parentPhone,
            relationship: result.relationship,
          }).toString()}`}
        >
          Register another child →
        </a>
        <button type="button" className="my-status-back" onClick={() => setResult(null)}>← Look up a different registration</button>
      </section>
    );
  }

  return (
    <form className="my-lookup-form" onSubmit={submit}>
      <label>
        <span>Registration code</span>
        <input value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="FP-2026-XXXXXXXX" required />
      </label>
      <label>
        <span>Child&apos;s date of birth</span>
        <input type="date" value={childDob} onChange={(e) => setChildDob(e.target.value)} required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Looking up…" : "Check status →"}</button>
    </form>
  );
}
