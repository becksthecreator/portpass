"use client";

import { useState } from "react";
import type { WeddingUnavailableDate } from "@/db/weddingAvailability";

export function AvailabilityManager({ initialDates }: { initialDates: WeddingUnavailableDate[] }) {
  const [dates, setDates] = useState(initialDates);
  const [onDate, setOnDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!onDate) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/weddings/admin/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onDate, note }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Could not block that date."); return; }
    setOnDate("");
    setNote("");
    if (data.dates) setDates(data.dates);
  }

  async function remove(id: number) {
    setBusy(true);
    const response = await fetch("/api/weddings/admin/availability", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok && data.dates) setDates(data.dates);
  }

  return (
    <div className="wedding-admin-panel">
      <div className="wedding-admin-field-grid">
        <label><span>Date</span><input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} /></label>
        <label><span>Note (private, optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. already booked" /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="staff-actions">
        <button disabled={busy || !onDate} onClick={add}>Block this date</button>
      </div>

      <ul className="wedding-notes-list" style={{ marginTop: 24 }}>
        {dates.length === 0 && <p>No dates blocked yet.</p>}
        {dates.map((d) => (
          <li key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><strong>{d.onDate}</strong>{d.note ? ` — ${d.note}` : ""}</span>
            <button className="danger-action" disabled={busy} onClick={() => remove(d.id)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
