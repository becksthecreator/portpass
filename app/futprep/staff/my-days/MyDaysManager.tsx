"use client";

import { useState, type FormEvent } from "react";
import { nassauToday } from "@/lib/futprepTerms";
import { WEEKDAY_NAMES, workingDaysLabel } from "@/lib/workingDays";

type Days = { coachId: number; name: string; workingDays: number[]; daysAway: string[] };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// A coach's own working days and days away (brief 31, C2). Each change
// saves on its own; the server takes the coach from the login.
export function MyDaysManager({ initial }: { initial: Days }) {
  const [days, setDays] = useState(initial);
  const [chosen, setChosen] = useState<number[]>(initial.workingDays);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const today = nassauToday();

  async function send(payload: Record<string, unknown>, done: string) {
    setError("");
    setMessage("");
    setBusy(true);
    const response = await fetch("/api/futprep/staff/my-days", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; days?: Days }) : { error: "No connection. Try again." };
    setBusy(false);
    if (!response?.ok || !data.days) {
      setError(data.error ?? "Could not save.");
      return;
    }
    setDays(data.days);
    setChosen(data.days.workingDays);
    setMessage(done);
  }

  function toggleDay(day: number) {
    setChosen((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b)));
  }

  async function addAway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const date = String(new FormData(form).get("date") ?? "");
    await send({ date, away: true }, `${dayLabel(date)} saved as a day away.`);
    form.reset();
  }

  return (
    <div className="team-manager">
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message" role="status">{message}</p>}

      <section className="team-manager-card my-days-card" aria-labelledby="working-days">
        <div><span>Private sessions</span><h2 id="working-days">Working days</h2><p>{days.workingDays.length ? `You take private sessions on ${workingDaysLabel(days.workingDays)}.` : "No days set: parents are told you'll confirm a time."}</p></div>
        <fieldset className="location-days">
          <legend>Days you take private sessions</legend>
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <label key={day}>
              <input type="checkbox" checked={chosen.includes(day)} onChange={() => toggleDay(day)} />
              <span>{WEEKDAY_NAMES[day].slice(0, 3)}</span>
            </label>
          ))}
        </fieldset>
        <div className="team-manager-actions">
          <button type="button" disabled={busy} onClick={() => send({ workingDays: chosen }, "Working days saved.")}>Save working days</button>
        </div>
      </section>

      <section className="team-manager-card my-days-card" aria-labelledby="days-away">
        <div><span>Can&rsquo;t be booked</span><h2 id="days-away">Days away</h2><p>A day away closes any open times you posted for it.</p></div>
        <form className="team-login-form" onSubmit={addAway}>
          <label><span>Date</span><input name="date" type="date" min={today} required /></label>
          <button type="submit" className="primary-button" disabled={busy}>Add day away</button>
        </form>
        {days.daysAway.length === 0 ? (
          <p className="team-manager-hint">No days away.</p>
        ) : (
          <ul className="ops-list">
            {days.daysAway.map((date) => (
              <li key={date}>
                <strong>{dayLabel(date)}</strong>
                <button type="button" className="my-days-remove" disabled={busy} onClick={() => send({ date, away: false }, `${dayLabel(date)} is open again.`)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
