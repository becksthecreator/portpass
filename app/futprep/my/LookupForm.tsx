"use client";

import { FormEvent, useState } from "react";
import type { ParentPassport } from "@/lib/passports/rules";

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
  registrationStatus: "pending_details" | "pending" | "confirmed" | "cancelled" | "waitlist" | "trial";
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
  const [passport, setPassport] = useState<ParentPassport | null>(null);

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
      const data = (await response.json()) as { status?: StatusResult; passport?: ParentPassport; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error ?? "Lookup failed.");
      setResult(data.status);
      setPassport(data.passport ?? null);
    } catch (e) {
      setResult(null);
      setPassport(null);
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const balanceCents = Math.max(0, result.amountDueCents - result.paidCents);
    // A waiting-list place or a free taster is not a paid place: no amount,
    // no balance and no list of sessions (terms v2, "Registering, booking
    // and enquiring").
    const waitlist = result.registrationStatus === "waitlist";
    const taster = result.registrationStatus === "trial";
    const nothingToPay = waitlist || taster;
    const badge = result.registrationStatus === "cancelled" ? "Cancelled" : waitlist ? "On the waitlist" : taster ? "Free taster" : result.paymentStatus;
    return (
      <section className="my-status-card">
        <span className={`status status-${nothingToPay ? "pending" : result.paymentStatus}`}>{badge}</span>
        <h1>{result.childName}</h1>
        <p className="my-status-reference">Registration code <strong>{result.referenceCode}</strong></p>

        <dl className="my-status-grid">
          <div><dt>Class</dt><dd>{result.program.name}</dd></div>
          <div><dt>Time</dt><dd>{result.program.day} · {result.program.time}–{result.program.endTime}</dd></div>
          <div><dt>Location</dt><dd>{result.program.location}</dd></div>
          {!nothingToPay && <div><dt>Plan</dt><dd>{result.paymentFrequency === "term" ? "Full term" : "Weekly"}</dd></div>}
          {!nothingToPay && <div><dt>Amount due</dt><dd>{money(result.amountDueCents)}</dd></div>}
          {!nothingToPay && <div><dt>Recorded</dt><dd>{money(result.paidCents)}</dd></div>}
        </dl>

        {waitlist && <p className="my-status-note">This is a waiting-list place. There is nothing to pay unless you are offered a place in the class.</p>}
        {taster && <p className="my-status-note">This is a free taster. There is nothing to pay.</p>}

        {balanceCents > 0 && !nothingToPay && result.registrationStatus !== "cancelled" && (
          <div className="my-status-balance">
            <span>Balance remaining</span>
            <strong>{money(balanceCents)}</strong>
            <p>Pay by {paymentMethodLabel(result.paymentMethod)}, using <strong>{result.referenceCode}</strong> as the reference.</p>
          </div>
        )}

        {result.remainingSessionDates.length > 0 && !nothingToPay && (
          <div className="my-status-sessions">
            <span className="choice-heading">Remaining sessions</span>
            <ul>{result.remainingSessionDates.map((date) => <li key={date}>{readableDate(date)}</li>)}</ul>
          </div>
        )}

        {/* Brief 31 (D): the Progress Passport, once Futprep has shared it. */}
        {passport && (
          <section className="my-status-passport" aria-labelledby="passport-title">
            <span className="choice-heading" id="passport-title">{passport.childFirstName}&apos;s Progress Passport · {passport.termName}</span>
            <p className="my-status-note">Where {passport.childFirstName} started this term, and where they finished, from 1 (just starting) to 5 (confident).</p>
            <dl className="my-status-grid">
              {passport.skills.map((skill) => (
                <div key={skill.name}><dt>{skill.name}</dt><dd>{skill.start ?? "–"} → {skill.end ?? "–"}</dd></div>
              ))}
            </dl>
            {passport.note && <p className="my-status-note">&ldquo;{passport.note}&rdquo;</p>}
            {passport.clipUrl && <a className="secondary-button" href={passport.clipUrl} target="_blank" rel="noopener noreferrer">Watch the clip ↗</a>}
            {passport.nextStep && <p className="my-status-note">Next step the coach suggests: <strong>{passport.nextStep.name}</strong></p>}
          </section>
        )}

        <a
          className="secondary-button"
          href={`/futprep/register?${new URLSearchParams({
            parentName: result.parentName,
            parentEmail: result.parentEmail,
            parentPhone: result.parentPhone,
            relationship: result.relationship,
          }).toString()}`}
        >
          Register another child →
        </a>
        <button type="button" className="my-status-back" onClick={() => { setResult(null); setPassport(null); }}>← Look up a different registration</button>
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
