"use client";

import { FormEvent, useState } from "react";
import type { FutprepProgramSummary } from "@/db/programs";
import { formatMoney } from "../../config";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dollarsToCents(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function AddProgramManager({ initialPrograms }: { initialPrograms: FutprepProgramSummary[] }) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const breakDates = String(form.get("breakDates") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const payload = {
      name: form.get("name"),
      ageMin: Number(form.get("ageMin")),
      ageMax: Number(form.get("ageMax")),
      coed: form.get("coed") === "on",
      locationName: form.get("locationName"),
      locationAddress: form.get("locationAddress"),
      dayOfWeek: form.get("dayOfWeek"),
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      capacity: Number(form.get("capacity")),
      termName: form.get("termName") || "Term 1",
      termStartDate: form.get("termStartDate"),
      termEndDate: form.get("termEndDate"),
      breakDates,
      weeklyFeeCents: dollarsToCents(form.get("weeklyFee")),
      termFeeCents: dollarsToCents(form.get("termFee")),
      registrationFeeCents: dollarsToCents(form.get("registrationFee")),
    };

    try {
      const response = await fetch("/api/futprep/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; programs?: FutprepProgramSummary[] };
      if (!response.ok) throw new Error(data.error ?? "Could not create the program.");
      if (data.programs) setPrograms(data.programs);
      setMessage("Program created — it's live on the registration page now.");
      event.currentTarget.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the program.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-manager">
      <div className="team-manager-grid">
        {programs.map((program) => (
          <article className="team-manager-card" key={program.id}>
            <div>
              <span>Ages {program.ageMin}–{program.ageMax}</span>
              <h2>{program.name}</h2>
              <p>{program.dayOfWeek} · {program.startTime}{program.endTime ? `–${program.endTime}` : ""} · {program.location}</p>
            </div>
            <div className="team-manager-flags">
              <span className={program.active ? "flag-on" : "flag-off"}>{program.active ? "Active" : "Inactive"}</span>
              {program.spotsRemaining !== null && (
                <span className="flag-on">{program.spotsRemaining} of {program.capacity} spots open</span>
              )}
            </div>
            <details className="team-profile-details">
              <summary>Term details</summary>
              <dl>
                <div><dt>Term</dt><dd>{program.term ? `${program.term.name} · ${program.term.startDate} – ${program.term.endDate}` : "No active term"}</dd></div>
                <div><dt>Weekly fee</dt><dd>{program.term ? formatMoney(program.term.weeklyFeeCents) : "—"}</dd></div>
                <div><dt>Term fee</dt><dd>{program.term ? formatMoney(program.term.termFeeCents) : "—"}</dd></div>
                <div><dt>Registered</dt><dd>{program.registered}</dd></div>
              </dl>
            </details>
          </article>
        ))}
        {programs.length === 0 && <p className="coach-manager-message">No programs yet — add the first one below.</p>}
      </div>

      <div className="team-admin-panels">
        <form className="team-admin-form" onSubmit={submit}>
          <span className="section-kicker">New program</span>
          <h2>Add a class or location.</h2>

          <div className="team-form-two">
            <label><span>Program name *</span><input name="name" placeholder="Futprep Out East Lil Kickers" required /></label>
            <label><span>Capacity *</span><input name="capacity" type="number" min={1} defaultValue={20} required /></label>
          </div>

          <div className="team-form-two">
            <label><span>Age min *</span><input name="ageMin" type="number" min={0} required /></label>
            <label><span>Age max *</span><input name="ageMax" type="number" min={0} required /></label>
          </div>

          <label className="inline-choice"><input name="coed" type="checkbox" defaultChecked /> Co-ed</label>

          <div className="team-form-two">
            <label><span>Location name *</span><input name="locationName" placeholder="Futprep Out East Field" required /></label>
            <label><span>Location address</span><input name="locationAddress" placeholder="Street, settlement, island" /></label>
          </div>

          <div className="team-form-two">
            <label><span>Day of week *</span>
              <select name="dayOfWeek" defaultValue="Saturday" required>
                {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label><span>Capacity note</span><small>Spots open shows automatically once parents register.</small></label>
          </div>

          <div className="team-form-two">
            <label><span>Start time *</span><input name="startTime" placeholder="9:00 AM" required /></label>
            <label><span>End time</span><input name="endTime" placeholder="9:35 AM" /></label>
          </div>

          <div className="team-form-two">
            <label><span>Term name</span><input name="termName" placeholder="Term 1" defaultValue="Term 1" /></label>
            <label><span>Break dates</span><input name="breakDates" placeholder="2026-10-10, 2026-10-17" /></label>
          </div>

          <div className="team-form-two">
            <label><span>Term start date *</span><input name="termStartDate" type="date" required /></label>
            <label><span>Term end date *</span><input name="termEndDate" type="date" required /></label>
          </div>

          <div className="team-form-two">
            <label><span>Weekly fee (BSD) *</span><input name="weeklyFee" type="number" min={0} step="0.01" required /></label>
            <label><span>Full term fee (BSD) *</span><input name="termFee" type="number" min={0} step="0.01" required /></label>
          </div>

          <label><span>Registration fee (BSD)</span><input name="registrationFee" type="number" min={0} step="0.01" defaultValue={0} /></label>

          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="coach-manager-message">{message}</p>}

          <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create program →"}</button>
        </form>
      </div>
    </div>
  );
}
